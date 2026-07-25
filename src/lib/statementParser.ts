/**
 * Credit card statement CSV parsing.
 *
 * Issuers all export CSV, but none of them agree on the shape. The three things
 * that actually vary and will silently corrupt your numbers if guessed wrong:
 *
 *  1. Column names       -- "Transaction Date" / "Date" / "Trans. Date" / "Posted Date"
 *  2. Amount layout      -- one signed Amount column, or separate Debit/Credit
 *  3. Sign convention    -- some issuers write charges positive, some negative
 *
 * So the parser detects all three from the header and the data rather than
 * assuming a format, and reports what it decided so the UI can show you.
 */

export interface ParsedRow {
  /** ISO yyyy-MM-dd */
  date: string
  description: string
  /** Positive = money spent. Payments and refunds are negative. */
  amount: number
  /** True for payments/refunds/credits, which are not spending. */
  isCredit: boolean
  /** Original CSV line number, for error reporting. */
  line: number
}

export interface ParseResult {
  rows: ParsedRow[]
  /** Rows that could not be read, with the reason. */
  errors: { line: number; reason: string; raw: string }[]
  /** What the parser worked out about the file, shown to the user. */
  detected: {
    dateColumn: string
    descriptionColumn: string
    amountMode: 'signed' | 'debit-credit'
    amountColumn: string
    /** For signed files: whether a charge appears as a positive or negative number. */
    chargeSign: 'positive' | 'negative'
    issuer: string
  }
}

export class StatementParseError extends Error {}

// ---------------------------------------------------------------------------
// CSV tokenizer
// ---------------------------------------------------------------------------

/**
 * Split CSV text into rows of fields. Handles quoted fields containing commas,
 * escaped double-quotes (""), and both CRLF and LF line endings -- merchant
 * descriptions routinely contain commas, so a naive split(',') mangles them.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  // Strip a UTF-8 BOM, which Excel adds and which otherwise corrupts the first header.
  if (text.charCodeAt(0) === 0xfeff) i = 1

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }

    if (ch === '"') { inQuotes = true; i++; continue }

    if (ch === ',') { row.push(field); field = ''; i++; continue }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      // Drop blank lines rather than emitting phantom rows.
      if (row.some(f => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
      i++
      continue
    }

    field += ch
    i++
  }

  row.push(field)
  if (row.some(f => f.trim() !== '')) rows.push(row)

  return rows
}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

const DATE_HEADERS = [
  'transaction date', 'trans date', 'trans. date', 'date',
  'posted date', 'post date', 'posting date',
]
const DESC_HEADERS = [
  'description', 'merchant', 'payee', 'details', 'transaction',
  'name', 'memo', 'reference',
]
const AMOUNT_HEADERS = ['amount', 'transaction amount', 'amt']
const DEBIT_HEADERS  = ['debit', 'charges', 'withdrawal', 'purchases']
const CREDIT_HEADERS = ['credit', 'payments', 'deposit', 'credits']

function findHeader(headers: string[], candidates: string[]): number {
  const norm = headers.map(h => h.trim().toLowerCase())
  // Exact match wins, so "Date" is not beaten by "Posted Date".
  for (const c of candidates) {
    const i = norm.indexOf(c)
    if (i !== -1) return i
  }
  for (const c of candidates) {
    const i = norm.findIndex(h => h.includes(c))
    if (i !== -1) return i
  }
  return -1
}

function guessIssuer(headers: string[]): string {
  const h = headers.map(x => x.trim().toLowerCase()).join('|')
  if (h.includes('card no.')) return 'Capital One'
  if (h.includes('member name')) return 'Citi'
  if (h.includes('post date') && h.includes('type')) return 'Chase'
  if (h.includes('card member')) return 'American Express'
  return 'Generic'
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

/**
 * Parse a date cell into ISO yyyy-MM-dd.
 *
 * Accepts yyyy-MM-dd, MM/dd/yyyy, MM/dd/yy, and MM-dd-yyyy. Deliberately does
 * NOT accept ambiguous day-first formats: US issuers are month-first, and
 * silently reading 03/04 as 4 March would misdate a whole statement.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return iso(+y, +mo, +d)
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m) {
    const [, mo, d, yRaw] = m
    let y = +yRaw
    if (yRaw.length === 2) y += y < 70 ? 2000 : 1900
    return iso(y, +mo, +d)
  }

  return null
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  // Rejects things like 02/30, which Date would silently roll into March.
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y.toString().padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Parse a money cell. Handles $, thousands separators, and both minus-sign and
 * accounting parenthesis negatives -- "(45.00)" means -45.00 on some exports.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null

  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }

  s = s.replace(/[$\s,]/g, '')
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) }
  else if (s.startsWith('+')) s = s.slice(1)

  if (s === '' || !/^\d*\.?\d+$/.test(s)) return null

  const n = parseFloat(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** Collapse a merchant string so the same shop matches across statements. */
export function normalizeDescription(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Trailing store numbers, phone numbers, and reference ids vary per visit.
    .replace(/#\s*\d+/g, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/[^a-z0-9&' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Stable identifier for a charge, used to skip rows already imported.
 * Deliberately excludes the category so re-importing after recategorising
 * still recognises the row as a duplicate.
 */
export function fingerprint(cardKey: string, date: string, amount: number, description: string): string {
  const norm = normalizeDescription(description)
  const cents = Math.round(amount * 100)
  return `${cardKey}|${date}|${cents}|${norm}`
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function parseStatement(text: string): ParseResult {
  const table = parseCsv(text)
  if (table.length === 0) throw new StatementParseError('The file is empty.')

  // Some issuers put a title or account summary above the real header, so scan
  // the first few lines for the row that actually looks like column names.
  let headerIdx = -1
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    if (findHeader(table[i], DATE_HEADERS) !== -1 &&
        findHeader(table[i], DESC_HEADERS) !== -1) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    throw new StatementParseError(
      'Could not find a header row with a date and description column. ' +
      'Export the statement as CSV from your card issuer and try again.'
    )
  }

  const headers = table[headerIdx]
  const dateIdx = findHeader(headers, DATE_HEADERS)
  const descIdx = findHeader(headers, DESC_HEADERS)
  const amtIdx  = findHeader(headers, AMOUNT_HEADERS)
  const debIdx  = findHeader(headers, DEBIT_HEADERS)
  const credIdx = findHeader(headers, CREDIT_HEADERS)

  const useDebitCredit = amtIdx === -1 && (debIdx !== -1 || credIdx !== -1)
  if (amtIdx === -1 && !useDebitCredit) {
    throw new StatementParseError(
      'Could not find an amount column. Expected one of: Amount, Debit, Credit.'
    )
  }

  const body = table.slice(headerIdx + 1)

  // For single-column files, work out the sign convention from the data rather
  // than assuming. A statement is mostly purchases, so whichever sign dominates
  // is the charge sign. Getting this backwards would invert every number.
  let chargeSign: 'positive' | 'negative' = 'positive'
  if (!useDebitCredit) {
    let pos = 0, neg = 0
    for (const r of body) {
      const v = parseAmount(r[amtIdx] ?? '')
      if (v === null || v === 0) continue
      if (v > 0) pos++; else neg++
    }
    chargeSign = neg > pos ? 'negative' : 'positive'
  }

  const rows: ParsedRow[] = []
  const errors: ParseResult['errors'] = []

  body.forEach((r, i) => {
    const line = headerIdx + i + 2 // 1-indexed, and past the header
    const raw = r.join(',')

    const date = parseDate(r[dateIdx] ?? '')
    if (!date) {
      errors.push({ line, reason: `Unreadable date "${(r[dateIdx] ?? '').trim()}"`, raw })
      return
    }

    const description = (r[descIdx] ?? '').trim()
    if (!description) {
      errors.push({ line, reason: 'Missing description', raw })
      return
    }

    let amount: number | null = null

    if (useDebitCredit) {
      const deb = debIdx  !== -1 ? parseAmount(r[debIdx]  ?? '') : null
      const cred = credIdx !== -1 ? parseAmount(r[credIdx] ?? '') : null
      // Debit column = spending, credit column = payment/refund.
      if (deb !== null && deb !== 0)       amount = Math.abs(deb)
      else if (cred !== null && cred !== 0) amount = -Math.abs(cred)
      else amount = 0
    } else {
      const v = parseAmount(r[amtIdx] ?? '')
      if (v === null) {
        errors.push({ line, reason: `Unreadable amount "${(r[amtIdx] ?? '').trim()}"`, raw })
        return
      }
      amount = chargeSign === 'negative' ? -v : v
    }

    if (amount === 0) return // zero-value rows carry no information

    rows.push({ date, description, amount, isCredit: amount < 0, line })
  })

  return {
    rows,
    errors,
    detected: {
      dateColumn: headers[dateIdx]?.trim() ?? '',
      descriptionColumn: headers[descIdx]?.trim() ?? '',
      amountMode: useDebitCredit ? 'debit-credit' : 'signed',
      amountColumn: useDebitCredit
        ? [debIdx !== -1 ? headers[debIdx]?.trim() : null, credIdx !== -1 ? headers[credIdx]?.trim() : null]
            .filter(Boolean).join(' / ')
        : headers[amtIdx]?.trim() ?? '',
      chargeSign,
      issuer: guessIssuer(headers),
    },
  }
}
