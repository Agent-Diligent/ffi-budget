import { Category } from './types'
import { normalizeDescription } from './statementParser'

export interface MerchantRule {
  id: string
  pattern: string
  category_id: string | null
  hit_count: number
}

export interface Suggestion {
  categoryId: string | null
  /** Which rule produced this, for display. Null when nothing matched. */
  matchedPattern: string | null
  confidence: 'high' | 'low' | 'none'
}

/**
 * Suggest a category for a statement line.
 *
 * Rules are plain substrings matched against the normalised description. When
 * several match, the longest pattern wins -- "costco gas" is more specific than
 * "costco", and specificity beats popularity. Ties break on how often the rule
 * has been confirmed.
 */
export function suggestCategory(
  description: string,
  rules: MerchantRule[],
  categories: Category[]
): Suggestion {
  const text = normalizeDescription(description)
  if (!text) return { categoryId: null, matchedPattern: null, confidence: 'none' }

  const valid = new Set(categories.map(c => c.id))

  const matches = rules
    .filter(r => r.category_id && valid.has(r.category_id))
    .filter(r => text.includes(normalizeDescription(r.pattern)))
    .sort((a, b) => {
      const d = b.pattern.length - a.pattern.length
      if (d !== 0) return d
      return b.hit_count - a.hit_count
    })

  if (matches.length === 0) {
    return { categoryId: null, matchedPattern: null, confidence: 'none' }
  }

  const best = matches[0]
  return {
    categoryId: best.category_id,
    matchedPattern: best.pattern,
    // A rule you have confirmed before, or a long specific pattern, is trusted.
    // Short unconfirmed seed rules get flagged so they surface in the review.
    confidence: best.hit_count > 0 || best.pattern.length >= 6 ? 'high' : 'low',
  }
}

/**
 * The pattern to remember when you correct a guess.
 *
 * Uses the first few meaningful words rather than the whole string, so
 * "COSTCO WHSE #1032 SAN JUAN" learns "costco whse" and matches next month's
 * charge at a different branch with a different store number.
 */
export function patternFromDescription(description: string): string {
  const words = normalizeDescription(description)
    .split(' ')
    .filter(w => w.length > 1)
  if (words.length === 0) return normalizeDescription(description)
  return words.slice(0, 2).join(' ')
}

/** Statement lines that are payments to the card, not spending to categorise. */
const PAYMENT_HINTS = [
  'payment thank you', 'online payment', 'autopay', 'auto pay',
  'payment received', 'pymt', 'thank you',
]

export function looksLikePayment(description: string): boolean {
  const t = normalizeDescription(description)
  return PAYMENT_HINTS.some(h => t.includes(h))
}
