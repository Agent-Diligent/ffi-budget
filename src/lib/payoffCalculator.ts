import { addMonths, format, parseISO, isValid } from 'date-fns'
import { CCCard } from './types'

export interface PayoffRow {
  key: string
  label: string
  total: number
  balances: Record<string, number>
  /** Interest charged across all cards in this month. */
  interest: number
  milestones: string[]
  /** Cards whose promo rate expired this month while still carrying a balance. */
  promoExpired: string[]
}

export interface PayoffSummary {
  rows: PayoffRow[]
  /** Total interest paid across the whole plan. */
  totalInterest: number
  /** Label of the debt-free month, or null if not paid off inside the horizon. */
  debtFreeLabel: string | null
}

const MAX_MONTHS = 600

/**
 * Effective APR for a card in a given month.
 *
 * A 0% promo only holds until `promo_end`. After that the balance starts
 * accruing at `post_promo_apr` (falling back to the card's own `apr`). Modelling
 * promos as 0% forever understated the cost of carrying a balance past expiry,
 * which is the single most expensive mistake this app can make.
 */
export function effectiveApr(card: CCCard, month: Date): number {
  if (!card.promo_end) return card.apr

  const end = parseISO(card.promo_end)
  if (!isValid(end)) return card.apr

  // Promo is live through the end of the month it expires in.
  const expired =
    month.getFullYear() > end.getFullYear() ||
    (month.getFullYear() === end.getFullYear() && month.getMonth() > end.getMonth())

  if (!expired) return card.apr
  return card.post_promo_apr ?? card.apr
}

/**
 * Month-by-month debt payoff projection using the avalanche method.
 *
 * Each month: accrue interest, pay every card its minimum, then throw all
 * remaining cash at the highest-rate card. "Remaining cash" is the user's extra
 * payment *plus* the minimums freed up by cards already paid off -- that
 * recycling is what makes avalanche accelerate, and omitting it made every
 * projected payoff date later than reality.
 */
export function calculatePayoffTimeline(
  cards: CCCard[],
  monthlyExtra: number,
  startDate: Date = new Date()
): PayoffSummary {
  if (cards.length === 0) {
    return { rows: [], totalInterest: 0, debtFreeLabel: null }
  }

  const bal: Record<string, number> = {}
  cards.forEach(c => { bal[c.key] = Math.max(0, c.balance) })

  // Every card's minimum is committed cash. Once a card hits zero, its minimum
  // rolls into the payment pool rather than disappearing.
  const totalMinimums = cards.reduce((s, c) => s + Math.max(0, c.min_payment), 0)
  const extra = Math.max(0, monthlyExtra)
  const monthlyBudget = totalMinimums + extra

  const rows: PayoffRow[] = []
  let month = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  let totalInterest = 0
  let debtFreeLabel: string | null = null

  for (let i = 0; i < MAX_MONTHS; i++) {
    const hadBalance: Record<string, boolean> = {}
    cards.forEach(c => { hadBalance[c.key] = bal[c.key] > 0.01 })

    // Rates can change mid-plan as promos expire, so recompute every month.
    const aprs: Record<string, number> = {}
    cards.forEach(c => { aprs[c.key] = effectiveApr(c, month) })

    const promoExpired: string[] = []
    cards.forEach(c => {
      if (c.promo_end && bal[c.key] > 0.01 && c.apr === 0 && aprs[c.key] > 0) {
        const end = parseISO(c.promo_end)
        if (isValid(end) &&
            end.getFullYear() === month.getFullYear() &&
            end.getMonth() === month.getMonth() - 1) {
          promoExpired.push(c.name)
        }
      }
    })

    // 1. Accrue interest at this month's effective rate.
    let monthInterest = 0
    cards.forEach(c => {
      if (bal[c.key] > 0.01 && aprs[c.key] > 0) {
        const charge = bal[c.key] * (aprs[c.key] / 100 / 12)
        bal[c.key] += charge
        monthInterest += charge
      }
    })
    totalInterest += monthInterest

    // 2. Spend the month's budget: minimums first, then avalanche the rest.
    let pool = monthlyBudget

    cards.forEach(c => {
      if (bal[c.key] > 0.01 && pool > 0.01) {
        const pmt = Math.min(Math.max(0, c.min_payment), bal[c.key], pool)
        bal[c.key] -= pmt
        pool -= pmt
      }
    })

    // Avalanche order depends on this month's effective rates, so an expired
    // promo correctly jumps the queue the moment it starts charging interest.
    const order = [...cards].sort((a, b) => {
      const d = aprs[b.key] - aprs[a.key]
      if (Math.abs(d) > 0.001) return d
      // Same rate: clear the card closest to losing its promo first.
      if (a.promo_end && b.promo_end) return a.promo_end.localeCompare(b.promo_end)
      if (a.promo_end) return -1
      if (b.promo_end) return 1
      return bal[a.key] - bal[b.key]
    })

    for (const card of order) {
      if (pool <= 0.01) break
      if (bal[card.key] > 0.01) {
        const pmt = Math.min(pool, bal[card.key])
        bal[card.key] -= pmt
        pool -= pmt
      }
    }

    cards.forEach(c => { if (bal[c.key] < 0.01) bal[c.key] = 0 })

    const milestones: string[] = []
    cards.forEach(c => {
      if (hadBalance[c.key] && bal[c.key] === 0) milestones.push(c.name + ' PAID')
    })

    const total = cards.reduce((s, c) => s + bal[c.key], 0)
    const label = format(month, 'MMM yyyy')

    if (total < 0.01) {
      milestones.push('DEBT FREE')
      debtFreeLabel = label
    }

    rows.push({
      key: format(month, 'yyyy-MM'),
      label,
      total: Math.round(total),
      balances: Object.fromEntries(cards.map(c => [c.key, Math.round(bal[c.key])])),
      interest: Math.round(monthInterest),
      milestones,
      promoExpired,
    })

    if (total < 0.01) break

    // Budget no longer covers the interest -- the debt is growing, so stop
    // rather than emitting hundreds of rows that never reach zero.
    if (i > 0 && rows[i].total >= rows[i - 1].total) break

    month = addMonths(month, 1)
  }

  return { rows, totalInterest: Math.round(totalInterest), debtFreeLabel }
}
