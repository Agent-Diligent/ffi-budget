import { addMonths, format } from 'date-fns'
import { CCCard } from './types'

export interface PayoffRow {
  key: string
  label: string
  total: number
  balances: Record<string, number>
  milestones: string[]
}

export function calculatePayoffTimeline(
  cards: CCCard[],
  monthlyExtra: number,
  startDate: Date = new Date()
): PayoffRow[] {
  if (cards.length === 0) return []

  // Work on mutable copy of balances
  const bal: Record<string, number> = {}
  cards.forEach(c => { bal[c.key] = Math.max(0, c.balance) })

  // Avalanche order: highest APR first, tie-break by earliest deadline
  const sorted = [...cards].sort((a, b) => {
    if (b.apr !== a.apr) return b.apr - a.apr
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return 0
  })

  const rows: PayoffRow[] = []
  let month = new Date(startDate.getFullYear(), startDate.getMonth(), 1)

  for (let i = 0; i < 120; i++) {
    // Track which cards had balance before this month
    const hadBalance: Record<string, boolean> = {}
    cards.forEach(c => { hadBalance[c.key] = bal[c.key] > 0.01 })

    // Apply monthly interest
    cards.forEach(c => {
      if (bal[c.key] > 0.01 && c.apr > 0) {
        bal[c.key] *= (1 + c.apr / 100 / 12)
      }
    })

    // Pay minimums on all cards
    cards.forEach(c => {
      if (bal[c.key] > 0.01) {
        bal[c.key] = Math.max(0, bal[c.key] - c.min_payment)
      }
    })

    // Apply extra payment in avalanche order
    let extra = Math.max(0, monthlyExtra)
    for (const card of sorted) {
      if (extra <= 0.01) break
      if (bal[card.key] > 0.01) {
        const pmt = Math.min(extra, bal[card.key])
        bal[card.key] -= pmt
        extra -= pmt
      }
    }

    // Round tiny values to zero
    cards.forEach(c => { if (bal[c.key] < 0.01) bal[c.key] = 0 })

    // Detect milestones
    const milestones: string[] = []
    cards.forEach(c => {
      if (hadBalance[c.key] && bal[c.key] === 0) {
        milestones.push(c.name + ' PAID')
      }
    })

    const total = cards.reduce((s, c) => s + bal[c.key], 0)
    if (total < 0.01) milestones.push('DEBT FREE')

    rows.push({
      key: format(month, 'yyyy-MM'),
      label: format(month, 'MMM yyyy'),
      total: Math.round(total),
      balances: Object.fromEntries(cards.map(c => [c.key, Math.round(bal[c.key])])),
      milestones,
    })

    if (total < 0.01) break
    month = addMonths(month, 1)
  }

  return rows
}
