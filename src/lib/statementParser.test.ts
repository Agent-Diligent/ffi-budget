import { describe, it, expect } from 'vitest'
import {
  parseCsv, parseDate, parseAmount, normalizeDescription,
  fingerprint, parseStatement, StatementParseError,
} from './statementParser'

describe('parseCsv', () => {
  it('splits plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,b\n"COSTCO WHSE, SAN JUAN",45.00'))
      .toEqual([['a', 'b'], ['COSTCO WHSE, SAN JUAN', '45.00']])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('strips a UTF-8 BOM from the first header', () => {
    expect(parseCsv('﻿Date,Amount\n2026-01-01,5')[0][0]).toBe('Date')
  })

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseDate', () => {
  it('reads ISO dates', () => {
    expect(parseDate('2026-07-04')).toBe('2026-07-04')
  })

  it('reads US month-first slash dates', () => {
    expect(parseDate('07/04/2026')).toBe('2026-07-04')
    expect(parseDate('7/4/2026')).toBe('2026-07-04')
  })

  it('expands two-digit years', () => {
    expect(parseDate('07/04/26')).toBe('2026-07-04')
    expect(parseDate('07/04/99')).toBe('1999-07-04')
  })

  it('reads dash-separated US dates', () => {
    expect(parseDate('12-25-2026')).toBe('2026-12-25')
  })

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseDate('02/30/2026')).toBeNull()
    expect(parseDate('13/01/2026')).toBeNull()
  })

  it('returns null for junk', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('Pending')).toBeNull()
  })
})

describe('parseAmount', () => {
  it('reads plain numbers', () => {
    expect(parseAmount('45.00')).toBe(45)
  })

  it('strips currency symbols and thousands separators', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56)
  })

  it('reads minus-sign negatives', () => {
    expect(parseAmount('-45.00')).toBe(-45)
  })

  it('reads accounting parenthesis negatives', () => {
    expect(parseAmount('(45.00)')).toBe(-45)
    expect(parseAmount('($1,234.56)')).toBe(-1234.56)
  })

  it('returns null for blanks and junk', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('n/a')).toBeNull()
  })
})

describe('normalizeDescription', () => {
  it('collapses case, whitespace, and per-visit store numbers', () => {
    expect(normalizeDescription('COSTCO   WHSE #1032  SAN JUAN'))
      .toBe(normalizeDescription('costco whse #0455 san juan'))
  })

  it('strips long reference numbers', () => {
    expect(normalizeDescription('AMAZON MKTPL 8829301')).toBe('amazon mktpl')
  })

  // Location is left intact on purpose: two same-amount charges at different
  // branches on the same day are distinct purchases, not a duplicate import.
  it('keeps different locations distinguishable', () => {
    expect(normalizeDescription('COSTCO WHSE #1032 SAN JUAN'))
      .not.toBe(normalizeDescription('COSTCO WHSE #0455 BAYAMON'))
  })
})

describe('fingerprint', () => {
  it('matches the same charge across re-imports', () => {
    const a = fingerprint('citi', '2026-07-04', 45.0, 'COSTCO WHSE #1032')
    const b = fingerprint('citi', '2026-07-04', 45.0, 'COSTCO WHSE #1032')
    expect(a).toBe(b)
  })

  it('separates different cards, dates, and amounts', () => {
    const base = fingerprint('citi', '2026-07-04', 45, 'COSTCO')
    expect(fingerprint('capone', '2026-07-04', 45, 'COSTCO')).not.toBe(base)
    expect(fingerprint('citi', '2026-07-05', 45, 'COSTCO')).not.toBe(base)
    expect(fingerprint('citi', '2026-07-04', 46, 'COSTCO')).not.toBe(base)
  })

  it('is not confused by floating point cents', () => {
    expect(fingerprint('a', '2026-01-01', 0.1 + 0.2, 'x'))
      .toBe(fingerprint('a', '2026-01-01', 0.3, 'x'))
  })
})

// ---------------------------------------------------------------------------
// Real issuer shapes
// ---------------------------------------------------------------------------

describe('parseStatement -- Capital One', () => {
  const csv = [
    'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
    '2026-07-02,2026-07-03,1202,COSTCO WHSE #1032,Merchandise,142.87,',
    '2026-07-05,2026-07-06,1202,"SHELL OIL, BAYAMON",Gas,52.10,',
    '2026-07-11,2026-07-12,1202,CAPITAL ONE AUTOPAY PYMT,Payment,,308.00',
  ].join('\n')

  it('detects the issuer and debit/credit layout', () => {
    const out = parseStatement(csv)
    expect(out.detected.issuer).toBe('Capital One')
    expect(out.detected.amountMode).toBe('debit-credit')
    expect(out.errors).toEqual([])
  })

  it('reads charges positive and payments negative', () => {
    const out = parseStatement(csv)
    expect(out.rows).toHaveLength(3)
    expect(out.rows[0]).toMatchObject({ date: '2026-07-02', amount: 142.87, isCredit: false })
    expect(out.rows[1].description).toBe('SHELL OIL, BAYAMON')
    expect(out.rows[2]).toMatchObject({ amount: -308, isCredit: true })
  })
})

describe('parseStatement -- Citi / Costco', () => {
  const csv = [
    'Status,Date,Description,Debit,Credit,Member Name',
    'Cleared,07/03/2026,COSTCO GAS #0455,48.22,,BERNARD',
    'Cleared,07/09/2026,COSTCO WHSE #0455,213.44,,BERNARD',
    'Cleared,07/20/2026,ONLINE PAYMENT THANK YOU,,41.00,BERNARD',
  ].join('\n')

  it('handles a leading status column and US dates', () => {
    const out = parseStatement(csv)
    expect(out.detected.issuer).toBe('Citi')
    expect(out.rows).toHaveLength(3)
    expect(out.rows[0]).toMatchObject({ date: '2026-07-03', amount: 48.22 })
    expect(out.rows[2].amount).toBe(-41)
  })
})

describe('parseStatement -- Chase (signed amount, charges negative)', () => {
  const csv = [
    'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
    '07/02/2026,07/03/2026,AMAZON MKTPL,Shopping,Sale,-42.19,',
    '07/04/2026,07/05/2026,STARBUCKS #2201,Food,Sale,-8.75,',
    '07/06/2026,07/07/2026,WALMART,Groceries,Sale,-118.60,',
    '07/15/2026,07/16/2026,PAYMENT THANK YOU,,Payment,500.00,',
  ].join('\n')

  it('infers that charges are the negative side and flips them', () => {
    const out = parseStatement(csv)
    expect(out.detected.amountMode).toBe('signed')
    expect(out.detected.chargeSign).toBe('negative')
    // Three negatives vs one positive, so negatives are the charges.
    expect(out.rows[0].amount).toBe(42.19)
    expect(out.rows[0].isCredit).toBe(false)
    expect(out.rows[3].amount).toBe(-500)
    expect(out.rows[3].isCredit).toBe(true)
  })
})

describe('parseStatement -- generic signed, charges positive', () => {
  const csv = [
    'Date,Description,Amount',
    '2026-07-01,GROCERY STORE,80.00',
    '2026-07-02,GAS STATION,45.00',
    '2026-07-03,REFUND,-20.00',
  ].join('\n')

  it('keeps positives as charges when they dominate', () => {
    const out = parseStatement(csv)
    expect(out.detected.chargeSign).toBe('positive')
    expect(out.rows[0].amount).toBe(80)
    expect(out.rows[2].amount).toBe(-20)
    expect(out.rows[2].isCredit).toBe(true)
  })
})

describe('parseStatement -- resilience', () => {
  it('skips preamble lines above the real header', () => {
    const csv = [
      'Account Summary Export',
      'Generated 2026-07-25',
      '',
      'Date,Description,Amount',
      '2026-07-01,SHOP,10.00',
    ].join('\n')
    const out = parseStatement(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].description).toBe('SHOP')
  })

  it('reports bad rows instead of dropping them silently', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-07-01,GOOD,10.00',
      'Pending,PENDING CHARGE,25.00',
      '2026-07-03,,15.00',
    ].join('\n')
    const out = parseStatement(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.errors).toHaveLength(2)
    expect(out.errors[0].reason).toMatch(/date/i)
    expect(out.errors[1].reason).toMatch(/description/i)
  })

  it('ignores zero-value rows', () => {
    const csv = 'Date,Description,Amount\n2026-07-01,NOTHING,0.00\n2026-07-02,REAL,5.00'
    expect(parseStatement(csv).rows).toHaveLength(1)
  })

  it('throws a clear error when there is no usable header', () => {
    expect(() => parseStatement('just,some,junk\n1,2,3'))
      .toThrow(StatementParseError)
  })

  it('throws when there is no amount column', () => {
    expect(() => parseStatement('Date,Description\n2026-07-01,SHOP'))
      .toThrow(/amount column/i)
  })

  it('throws on an empty file', () => {
    expect(() => parseStatement('')).toThrow(StatementParseError)
  })
})
