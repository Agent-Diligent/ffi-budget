import { describe, it, expect } from 'vitest'
import { calculatePayoffTimeline, effectiveApr } from './payoffCalculator'
import { CCCard } from './types'

function card(over: Partial<CCCard> & { key: string }): CCCard {
  return {
    id: over.key,
    name: over.key,
    bank: '',
    apr: 0,
    start_balance: over.balance ?? 0,
    balance: 0,
    min_payment: 0,
    color: '#fff',
    note: null,
    promo_end: null,
    post_promo_apr: null,
    sort_order: 0,
    ...over,
  }
}

const START = new Date(2026, 6, 1) // Jul 2026

describe('effectiveApr', () => {
  it('returns the card APR when there is no promo', () => {
    const c = card({ key: 'a', apr: 22 })
    expect(effectiveApr(c, START)).toBe(22)
  })

  it('holds the promo rate through the month of expiry', () => {
    const c = card({ key: 'a', apr: 0, promo_end: '2026-12-16', post_promo_apr: 24.99 })
    expect(effectiveApr(c, new Date(2026, 11, 1))).toBe(0)  // Dec 2026
  })

  it('applies the post-promo APR after expiry', () => {
    const c = card({ key: 'a', apr: 0, promo_end: '2026-12-16', post_promo_apr: 24.99 })
    expect(effectiveApr(c, new Date(2027, 0, 1))).toBe(24.99) // Jan 2027
  })

  it('falls back to the card APR when no post-promo rate is set', () => {
    const c = card({ key: 'a', apr: 5, promo_end: '2026-01-01', post_promo_apr: null })
    expect(effectiveApr(c, START)).toBe(5)
  })

  it('ignores an unparseable promo date rather than throwing', () => {
    const c = card({ key: 'a', apr: 7, promo_end: 'Dec 16, 2026', post_promo_apr: 30 })
    expect(effectiveApr(c, START)).toBe(7)
  })
})

describe('calculatePayoffTimeline', () => {
  it('returns an empty plan for no cards', () => {
    const out = calculatePayoffTimeline([], 500, START)
    expect(out.rows).toEqual([])
    expect(out.debtFreeLabel).toBeNull()
  })

  it('pays off a single 0% card in the expected number of months', () => {
    const cards = [card({ key: 'a', balance: 1000, min_payment: 100 })]
    // 100 min + 400 extra = 500/mo against 1000 -> 2 months
    const out = calculatePayoffTimeline(cards, 400, START)
    expect(out.rows).toHaveLength(2)
    expect(out.rows[1].total).toBe(0)
    expect(out.debtFreeLabel).toBe('Aug 2026')
    expect(out.totalInterest).toBe(0)
  })

  it('charges interest on an APR-bearing card', () => {
    const cards = [card({ key: 'a', balance: 1000, apr: 24, min_payment: 100 })]
    const out = calculatePayoffTimeline(cards, 0, START)
    // 24% APR -> 2%/mo -> first month accrues 20
    expect(out.rows[0].interest).toBe(20)
    expect(out.totalInterest).toBeGreaterThan(0)
  })

  it('targets the highest APR first', () => {
    const cards = [
      card({ key: 'low',  balance: 1000, apr: 5,  min_payment: 25 }),
      card({ key: 'high', balance: 1000, apr: 25, min_payment: 25 }),
    ]
    const out = calculatePayoffTimeline(cards, 500, START)
    // The extra goes at `high`, so it clears while `low` still carries a balance.
    const highPaidAt = out.rows.findIndex(r => r.balances.high === 0)
    const lowPaidAt  = out.rows.findIndex(r => r.balances.low === 0)
    expect(highPaidAt).toBeLessThan(lowPaidAt)
  })

  // The bug this rewrite fixes: the old version only ever applied `monthlyExtra`
  // after a card was cleared, so a paid-off card's minimum vanished from the plan.
  it('rolls a paid-off card’s minimum into the remaining debt', () => {
    const cards = [
      card({ key: 'small', balance: 200,  min_payment: 200 }),
      card({ key: 'big',   balance: 1000, min_payment: 100 }),
    ]
    // Month 1: small takes its 200 and clears. big pays 100 min + 100 extra = 800 left.
    // Month 2 onward the freed 200 joins the pool -> 400/mo against big.
    const out = calculatePayoffTimeline(cards, 100, START)
    expect(out.rows[0].balances.small).toBe(0)
    expect(out.rows[0].balances.big).toBe(800)
    expect(out.rows[1].balances.big).toBe(400)
    expect(out.rows[2].balances.big).toBe(0)
    expect(out.debtFreeLabel).toBe('Sep 2026')
  })

  it('starts charging interest once a promo expires', () => {
    const cards = [card({
      key: 'promo', balance: 5000, apr: 0, min_payment: 50,
      promo_end: '2026-08-31', post_promo_apr: 24,
    })]
    const out = calculatePayoffTimeline(cards, 0, START)
    expect(out.rows[0].interest).toBe(0)  // Jul, promo live
    expect(out.rows[1].interest).toBe(0)  // Aug, expires end of month
    expect(out.rows[2].interest).toBeGreaterThan(0) // Sep, now accruing
  })

  it('flags the month a promo expires with a balance still on it', () => {
    const cards = [card({
      key: 'promo', balance: 5000, apr: 0, min_payment: 50,
      promo_end: '2026-08-31', post_promo_apr: 24,
    })]
    const out = calculatePayoffTimeline(cards, 0, START)
    expect(out.rows[2].promoExpired).toContain('promo')
  })

  it('prioritises a promo card once its rate overtakes the others', () => {
    const cards = [
      card({ key: 'steady', balance: 3000, apr: 20, min_payment: 50 }),
      card({
        key: 'promo', balance: 3000, apr: 0, min_payment: 50,
        promo_end: '2026-07-31', post_promo_apr: 29,
      }),
    ]
    const out = calculatePayoffTimeline(cards, 1000, START)
    // Jul: promo is still 0%, so the extra attacks `steady`.
    expect(out.rows[0].balances.steady).toBeLessThan(out.rows[0].balances.promo)
    // Aug onward promo is at 29% and outranks steady, so it closes out first.
    const promoPaid  = out.rows.findIndex(r => r.balances.promo === 0)
    const steadyPaid = out.rows.findIndex(r => r.balances.steady === 0)
    expect(promoPaid).toBeLessThan(steadyPaid)
  })

  it('stops instead of looping when the budget cannot cover the interest', () => {
    const cards = [card({ key: 'a', balance: 10000, apr: 30, min_payment: 10 })]
    const out = calculatePayoffTimeline(cards, 0, START)
    expect(out.rows.length).toBeLessThan(10)
    expect(out.debtFreeLabel).toBeNull()
  })

  it('never drives a balance negative', () => {
    const cards = [card({ key: 'a', balance: 100, min_payment: 500 })]
    const out = calculatePayoffTimeline(cards, 5000, START)
    expect(out.rows[0].balances.a).toBe(0)
    expect(out.rows).toHaveLength(1)
  })

  it('labels months from the start date it is given', () => {
    const cards = [card({ key: 'a', balance: 300, min_payment: 100 })]
    const out = calculatePayoffTimeline(cards, 0, new Date(2027, 0, 15))
    expect(out.rows[0].label).toBe('Jan 2027')
    expect(out.rows[0].key).toBe('2027-01')
  })
})
