'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { Category, CCCard } from '@/lib/types'
import { fmt } from '@/lib/utils'
import {
  parseStatement, fingerprint, StatementParseError,
  type ParseResult, type ParsedRow,
} from '@/lib/statementParser'
import {
  suggestCategory, patternFromDescription, looksLikePayment,
  type MerchantRule,
} from '@/lib/categorize'

interface ReviewRow extends ParsedRow {
  fp: string
  categoryId: string | null
  /** What the rules originally guessed, so we know when you corrected it. */
  suggestedId: string | null
  matchedPattern: string | null
  confidence: 'high' | 'low' | 'none'
  duplicate: boolean
  include: boolean
  isPayment: boolean
}

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)

  const [cards, setCards]   = useState<CCCard[]>([])
  const [cats, setCats]     = useState<Category[]>([])
  const [rules, setRules]   = useState<MerchantRule[]>([])
  const [cardKey, setCardKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  const [filename, setFilename] = useState('')
  const [parsed, setParsed]     = useState<ParseResult | null>(null)
  const [rows, setRows]         = useState<ReviewRow[]>([])
  const [closingBalance, setClosingBalance] = useState('')
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: cardData, error: e1 }, { data: catData, error: e2 }, { data: ruleData, error: e3 }] =
        await Promise.all([
          supabase.from('cc_cards').select('*').order('sort_order'),
          supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
          supabase.from('merchant_rules').select('*'),
        ])
      const err = e1 || e2 || e3
      if (err) { setError('Could not load setup data: ' + err.message); setLoading(false); return }
      setCards(cardData || [])
      setCats(catData || [])
      setRules(ruleData || [])
      if (cardData?.length) setCardKey(cardData[0].key)
      setLoading(false)
    }
    load()
  }, [])

  const card = cards.find(c => c.key === cardKey)

  async function handleFile(file: File) {
    setError('')
    setResult(null)
    setFilename(file.name)

    if (!cardKey) { setError('Pick which card this statement belongs to first.'); return }

    let text: string
    try {
      text = await file.text()
    } catch {
      setError('Could not read that file.')
      return
    }

    let out: ParseResult
    try {
      out = parseStatement(text)
    } catch (e) {
      setParsed(null)
      setRows([])
      setError(e instanceof StatementParseError ? e.message : 'Could not parse that file.')
      return
    }

    if (out.rows.length === 0) {
      setParsed(out); setRows([])
      setError('No usable transactions found in that file.')
      return
    }

    // Check which of these charges are already in the database.
    const fps = out.rows.map(r => fingerprint(cardKey, r.date, r.amount, r.description))
    const existing = new Set<string>()
    // Chunk the lookup so a long statement does not blow the URL length limit.
    for (let i = 0; i < fps.length; i += 100) {
      const { data } = await supabase
        .from('transactions')
        .select('fingerprint')
        .in('fingerprint', fps.slice(i, i + 100))
      ;(data || []).forEach(d => d.fingerprint && existing.add(d.fingerprint))
    }

    const review: ReviewRow[] = out.rows.map((r, i) => {
      const fp = fps[i]
      const isPayment = r.isCredit || looksLikePayment(r.description)
      const s = isPayment
        ? { categoryId: null, matchedPattern: null, confidence: 'none' as const }
        : suggestCategory(r.description, rules, cats)
      return {
        ...r,
        fp,
        categoryId: s.categoryId,
        suggestedId: s.categoryId,
        matchedPattern: s.matchedPattern,
        confidence: s.confidence,
        duplicate: existing.has(fp),
        // Payments to the card are not spending, and duplicates are already in.
        include: !existing.has(fp) && !isPayment,
        isPayment,
      }
    })

    setParsed(out)
    setRows(review)

    // Offer the statement's last date as the balance date context.
    const latest = out.rows.reduce((a, b) => (a.date > b.date ? a : b))
    if (!closingBalance && card) setClosingBalance(String(card.balance))
    void latest
  }

  const stats = useMemo(() => {
    const included = rows.filter(r => r.include)
    return {
      total: rows.length,
      included: included.length,
      duplicates: rows.filter(r => r.duplicate).length,
      payments: rows.filter(r => r.isPayment).length,
      uncategorised: included.filter(r => !r.categoryId).length,
      spend: included.reduce((s, r) => s + r.amount, 0),
    }
  }, [rows])

  function setRow(i: number, patch: Partial<ReviewRow>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function commit() {
    setError('')
    setCommitting(true)

    const toImport = rows.filter(r => r.include)
    if (toImport.length === 0) {
      setCommitting(false)
      setError('Nothing selected to import.')
      return
    }

    // Insert the charges. Fingerprints are unique, so anything that slipped
    // through the duplicate check is rejected by the database rather than
    // double-counted. ignoreDuplicates keeps the rest of the batch going.
    const { data: inserted, error: insErr } = await supabase
      .from('transactions')
      .upsert(
        toImport.map(r => ({
          date: r.date,
          category_id: r.categoryId,
          amount: r.amount,
          description: r.description,
          payment_method: card?.name ?? 'Card',
          card_key: cardKey,
          source: 'import',
          fingerprint: r.fp,
        })),
        { onConflict: 'fingerprint', ignoreDuplicates: true }
      )
      .select('id')

    if (insErr) {
      setCommitting(false)
      setError('Import failed: ' + insErr.message)
      return
    }

    const importedCount = inserted?.length ?? 0

    // Remember every category you set by hand, so next month guesses it.
    const corrections = toImport.filter(r => r.categoryId && r.categoryId !== r.suggestedId)
    if (corrections.length > 0) {
      const byPattern = new Map<string, string>()
      corrections.forEach(r => {
        byPattern.set(patternFromDescription(r.description), r.categoryId!)
      })
      await supabase.from('merchant_rules').upsert(
        Array.from(byPattern, ([pattern, category_id]) => ({ pattern, category_id, hit_count: 1 })),
        { onConflict: 'pattern' }
      )
    }

    // Update the card balance and log a snapshot for the History charts.
    const bal = parseFloat(closingBalance)
    if (card && Number.isFinite(bal) && bal >= 0) {
      const today = format(new Date(), 'yyyy-MM-dd')
      const [snap, upd] = await Promise.all([
        supabase.from('cc_snapshots').upsert(
          { date: today, card_key: card.key, card_name: card.name, balance: bal },
          { onConflict: 'card_key,date' }
        ),
        supabase.from('cc_cards').update({ balance: bal }).eq('id', card.id),
      ])
      if (snap.error || upd.error) {
        setCommitting(false)
        setError(
          `Imported ${importedCount} transactions, but the balance update failed: ` +
          (snap.error || upd.error)!.message
        )
        return
      }
    }

    const latest = toImport.reduce((a, b) => (a.date > b.date ? a : b))
    await supabase.from('statement_imports').insert({
      card_key: cardKey,
      filename,
      statement_end: latest.date,
      closing_balance: Number.isFinite(bal) ? bal : null,
      rows_imported: importedCount,
      rows_skipped: rows.length - importedCount,
    })

    // Pick up any rules we just learned.
    const { data: freshRules } = await supabase.from('merchant_rules').select('*')
    setRules(freshRules || [])

    setCommitting(false)
    setResult({ imported: importedCount, skipped: rows.length - importedCount })
    setRows([])
    setParsed(null)
    setFilename('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function reset() {
    setRows([]); setParsed(null); setFilename(''); setError(''); setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) {
    return <div className="text-text-muted text-center py-20">Loading...</div>
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Import Statement</h1>
        <p className="text-xs text-text-muted mt-1">
          Download the CSV export from your card issuer, then drop it here. Charges become
          transactions and the closing balance updates the card.
        </p>
      </div>

      {error && (
        <div className="text-red text-sm bg-red/10 border border-red/30 rounded-lg px-4 py-3 mb-5">
          {error}
        </div>
      )}

      {result && (
        <div className="text-green text-sm bg-green/10 border border-green/30 rounded-lg px-4 py-3 mb-5">
          Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}
          {result.skipped > 0 && `, skipped ${result.skipped} (duplicates, payments, or unticked)`}.
        </div>
      )}

      {/* Step 1: pick card + file */}
      <div className="card mb-6">
        <div className="card-head">
          <h2 className="font-semibold text-sm">1. Choose card and file</h2>
          {parsed && <button onClick={reset} className="btn-ghost text-xs py-1 px-3">Start over</button>}
        </div>
        <div className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Card</label>
            <select
              value={cardKey}
              onChange={e => { setCardKey(e.target.value); reset() }}
              className="inp min-w-[200px]"
            >
              {cards.length === 0 && <option value="">No cards yet</option>}
              {cards.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-text-muted mb-1 block">Statement CSV</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              className="inp w-full file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-muted file:text-text-primary file:text-xs file:cursor-pointer"
            />
          </div>
        </div>
        {cards.length === 0 && (
          <div className="px-4 pb-4 text-xs text-yellow">
            Add a card on the CC Tracker page before importing a statement.
          </div>
        )}
      </div>

      {parsed && rows.length > 0 && (
        <>
          {/* What the parser worked out */}
          <div className="card mb-6">
            <div className="card-head">
              <h2 className="font-semibold text-sm">2. Detected format</h2>
              <span className="text-xs text-text-muted">{filename}</span>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {[
                ['Issuer', parsed.detected.issuer],
                ['Date column', parsed.detected.dateColumn],
                ['Description', parsed.detected.descriptionColumn],
                ['Amount', parsed.detected.amountColumn],
                ['Charges appear as', parsed.detected.amountMode === 'debit-credit'
                  ? 'Debit column'
                  : parsed.detected.chargeSign],
              ].map(([l, v]) => (
                <div key={l} className="bg-bg rounded p-2">
                  <div className="text-text-muted">{l}</div>
                  <div className="text-text-primary font-medium mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            {parsed.errors.length > 0 && (
              <div className="px-4 pb-4">
                <div className="text-xs text-yellow mb-1">
                  {parsed.errors.length} row{parsed.errors.length === 1 ? '' : 's'} could not be read:
                </div>
                <div className="max-h-28 overflow-y-auto text-xs text-text-muted space-y-0.5">
                  {parsed.errors.map(e => (
                    <div key={e.line}>Line {e.line}: {e.reason}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { l: 'Rows found',    v: String(stats.total),        c: 'text-text-primary' },
              { l: 'Will import',   v: String(stats.included),     c: 'text-green' },
              { l: 'Duplicates',    v: String(stats.duplicates),   c: 'text-text-muted' },
              { l: 'Payments',      v: String(stats.payments),     c: 'text-blue' },
              { l: 'Total spend',   v: fmt(stats.spend),           c: 'text-red' },
            ].map(k => (
              <div key={k.l} className="card p-3 text-center">
                <div className="text-xs text-text-muted mb-1">{k.l}</div>
                <div className={`text-lg font-bold ${k.c}`}>{k.v}</div>
              </div>
            ))}
          </div>

          {stats.uncategorised > 0 && (
            <div className="text-yellow text-xs bg-yellow/10 border border-yellow/30 rounded-lg px-4 py-2 mb-4">
              {stats.uncategorised} row{stats.uncategorised === 1 ? '' : 's'} still have no category.
              They will import as uncategorised and will not count toward any budget line.
            </div>
          )}

          {/* Review table */}
          <div className="card mb-6">
            <div className="card-head">
              <h2 className="font-semibold text-sm">3. Review before importing</h2>
              <span className="text-xs text-text-muted">
                Corrections are remembered for next month
              </span>
            </div>
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg z-10">
                  <tr className="text-text-muted text-xs">
                    <th className="px-3 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={rows.every(r => r.include)}
                        onChange={e => setRows(rs => rs.map(r => ({ ...r, include: e.target.checked })))}
                        title="Toggle all"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.fp + i}
                      className={`border-t border-muted ${
                        !r.include ? 'opacity-45' : r.confidence === 'none' && !r.isPayment ? 'bg-yellow/5' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={e => setRow(i, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                        {format(parseISO(r.date), 'MMM d')}
                      </td>
                      <td className="px-3 py-2 text-text-primary max-w-[280px] truncate" title={r.description}>
                        {r.description}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${
                        r.amount < 0 ? 'text-green' : 'text-text-primary'
                      }`}>
                        {r.amount < 0 ? '-' : ''}{fmt(r.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.categoryId ?? ''}
                          onChange={e => setRow(i, { categoryId: e.target.value || null })}
                          className="inp text-xs py-1 min-w-[150px]"
                          disabled={!r.include}
                        >
                          <option value="">-- none --</option>
                          {cats.map(c => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.duplicate && <span className="badge badge-yellow">Already imported</span>}
                        {r.isPayment && <span className="badge badge-blue ml-1">Payment</span>}
                        {!r.duplicate && !r.isPayment && r.confidence === 'none' && (
                          <span className="badge badge-red">No match</span>
                        )}
                        {r.matchedPattern && r.categoryId === r.suggestedId && (
                          <span className="text-text-muted ml-1">via &ldquo;{r.matchedPattern}&rdquo;</span>
                        )}
                        {r.categoryId !== r.suggestedId && r.categoryId && (
                          <span className="badge badge-green ml-1">Will learn</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Commit */}
          <div className="card">
            <div className="card-head">
              <h2 className="font-semibold text-sm">4. Closing balance and import</h2>
            </div>
            <div className="p-4 flex flex-wrap gap-4 items-end justify-between">
              <div>
                <label className="text-xs text-text-muted mb-1 block">
                  Statement closing balance for {card?.name}
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={closingBalance}
                  onChange={e => setClosingBalance(e.target.value)}
                  className="inp w-40 text-right text-lg font-bold"
                />
                <div className="text-xs text-text-muted mt-1">
                  Updates the card and logs a snapshot. Leave blank to skip.
                </div>
              </div>
              <button
                onClick={commit}
                disabled={committing || stats.included === 0}
                className="btn-primary"
              >
                {committing
                  ? 'Importing...'
                  : `Import ${stats.included} transaction${stats.included === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
