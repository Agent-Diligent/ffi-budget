import { describe, it, expect } from 'vitest'
import { suggestCategory, patternFromDescription, looksLikePayment, MerchantRule } from './categorize'
import { Category } from './types'

function cat(id: string, name: string): Category {
  return {
    id, name, icon: '', type: 'food', monthly_target: 0,
    is_active: true, sort_order: 0, created_at: '',
  }
}

function rule(pattern: string, category_id: string, hit_count = 1): MerchantRule {
  return { id: pattern, pattern, category_id, hit_count }
}

const GROCERIES = cat('c1', 'Groceries')
const GAS       = cat('c2', 'Gas')
const COFFEE    = cat('c3', 'Coffee')
const CATS      = [GROCERIES, GAS, COFFEE]

describe('suggestCategory', () => {
  it('matches a simple merchant rule', () => {
    const out = suggestCategory('COSTCO WHSE #1032', [rule('costco', 'c1')], CATS)
    expect(out.categoryId).toBe('c1')
    expect(out.confidence).toBe('high')
  })

  it('returns none when nothing matches', () => {
    const out = suggestCategory('SOME NEW SHOP', [rule('costco', 'c1')], CATS)
    expect(out.categoryId).toBeNull()
    expect(out.confidence).toBe('none')
  })

  it('prefers the more specific pattern', () => {
    const rules = [rule('costco', 'c1'), rule('costco gas', 'c2')]
    expect(suggestCategory('COSTCO GAS #0455', rules, CATS).categoryId).toBe('c2')
    expect(suggestCategory('COSTCO WHSE #0455', rules, CATS).categoryId).toBe('c1')
  })

  it('breaks ties on confirmed hit count', () => {
    const rules = [rule('shop', 'c1', 1), rule('stop', 'c2', 9)]
    expect(suggestCategory('SHOP STOP', rules, CATS).categoryId).toBe('c2')
  })

  it('ignores rules pointing at a deleted category', () => {
    const out = suggestCategory('COSTCO', [rule('costco', 'gone')], CATS)
    expect(out.categoryId).toBeNull()
  })

  it('matches regardless of case and store numbers', () => {
    const rules = [rule('costco whse', 'c1')]
    expect(suggestCategory('costco   whse  #9999', rules, CATS).categoryId).toBe('c1')
  })

  it('flags a short unconfirmed seed rule as low confidence', () => {
    const out = suggestCategory('KFC BAYAMON', [rule('kfc', 'c1', 0)], CATS)
    expect(out.categoryId).toBe('c1')
    expect(out.confidence).toBe('low')
  })

  it('reports which pattern matched', () => {
    const out = suggestCategory('STARBUCKS #2201', [rule('starbucks', 'c3')], CATS)
    expect(out.matchedPattern).toBe('starbucks')
  })

  it('handles an empty description safely', () => {
    expect(suggestCategory('', [rule('x', 'c1')], CATS).confidence).toBe('none')
  })
})

describe('patternFromDescription', () => {
  it('learns a branch-independent pattern', () => {
    expect(patternFromDescription('COSTCO WHSE #1032 SAN JUAN')).toBe('costco whse')
  })

  it('drops per-visit reference numbers', () => {
    expect(patternFromDescription('AMAZON MKTPL 8829301')).toBe('amazon mktpl')
  })

  it('survives a single-word merchant', () => {
    expect(patternFromDescription('STARBUCKS')).toBe('starbucks')
  })

  // The learned pattern must actually match the line it was learned from.
  it('round-trips: a learned pattern matches its own description', () => {
    const desc = 'COSTCO WHSE #1032 SAN JUAN'
    const learned = patternFromDescription(desc)
    const out = suggestCategory(desc, [rule(learned, 'c1')], CATS)
    expect(out.categoryId).toBe('c1')
  })

  it('round-trips across a different branch of the same merchant', () => {
    const learned = patternFromDescription('COSTCO WHSE #1032 SAN JUAN')
    const out = suggestCategory('COSTCO WHSE #0455 BAYAMON', [rule(learned, 'c1')], CATS)
    expect(out.categoryId).toBe('c1')
  })
})

describe('looksLikePayment', () => {
  it('spots common payment wordings', () => {
    expect(looksLikePayment('ONLINE PAYMENT THANK YOU')).toBe(true)
    expect(looksLikePayment('CAPITAL ONE AUTOPAY PYMT')).toBe(true)
    expect(looksLikePayment('PAYMENT RECEIVED')).toBe(true)
  })

  it('leaves ordinary purchases alone', () => {
    expect(looksLikePayment('COSTCO WHSE #1032')).toBe(false)
    expect(looksLikePayment('SHELL OIL')).toBe(false)
  })
})
