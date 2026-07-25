'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { Category, Transaction } from '@/lib/types'
import { fmt, getMonthRange, currentMonth } from '@/lib/utils'
import { normalizeDescription } from '@/lib/statementParser'
import { patternFromDescription } from '@/lib/categorize'
import AddTransactionModal from '@/components/AddTransactionModal'

export default function TransactionsPage() {
  const [date, setDate]      = useState(currentMonth)
  const [cats, setCats]      = useState<Category[]>([])
  const [txns, setTxns]      = useState<Transaction[]>([])
  const [loading, setLoading]= useState(true)
  const [showAdd, setShowAdd]= useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving]  = useState<string | null>(null)
  const [error, setError]    = useState('')
  const [onlyUncategorised, setOnlyUncategorised] = useState(false)
  const [notice, setNotice]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { start, end } = getMonthRange(date)
    const [{ data: catData, error: e1 }, { data: txnData, error: e2 }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('transactions').select('*, category:categories(*)').gte('date', start).lte('date', end).order('date', { ascending: false }),
    ])
    if (e1 || e2) {
      setError('Could not load transactions: ' + (e1 || e2)!.message)
      setLoading(false)
      return
    }
    setCats(catData || [])
    setTxns(txnData || [])
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  async function deleteTransaction(id: string) {
    setError('')
    setDeleting(id)
    const { error: err } = await supabase.from('transactions').delete().eq('id', id)
    setDeleting(null)
    if (err) { setError('Could not delete: ' + err.message); return }
    load()
  }

  /** Change one transaction's category. Does not create a merchant rule. */
  async function setCategory(txn: Transaction, categoryId: string | null) {
    setError('')
    setNotice('')
    setSaving(txn.id)
    const { error: err } = await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .eq('id', txn.id)
    setSaving(null)
    if (err) { setError('Could not update category: ' + err.message); return }
    load()
  }

  /**
   * Apply a category to every uncategorised transaction from the same merchant
   * in this month, and remember it as a rule so future imports match it.
   * Single edits deliberately do not create rules: using this button is the
   * explicit signal that the mapping should be permanent.
   */
  async function applyToMerchant(txn: Transaction, categoryId: string) {
    if (!txn.description) return
    setError('')
    setNotice('')
    setSaving(txn.id)

    const key = normalizeDescription(txn.description)
    const ids = txns
      .filter(t => t.description && normalizeDescription(t.description) === key)
      .map(t => t.id)

    const { error: err } = await supabase
      .from('transactions')
      .update({ category_id: categoryId })
      .in('id', ids)

    if (err) {
      setSaving(null)
      setError('Could not apply to matching transactions: ' + err.message)
      return
    }

    const pattern = patternFromDescription(txn.description)
    const { error: ruleErr } = await supabase
      .from('merchant_rules')
      .upsert({ pattern, category_id: categoryId, hit_count: 1 }, { onConflict: 'pattern' })

    setSaving(null)
    const catName = cats.find(c => c.id === categoryId)?.name ?? 'category'
    setNotice(
      ruleErr
        ? `Updated ${ids.length} transactions, but the rule could not be saved: ${ruleErr.message}`
        : `Updated ${ids.length} transaction${ids.length === 1 ? '' : 's'} and saved "${pattern}" as a rule for ${catName}.`
    )
    load()
  }

  const uncategorisedCount = txns.filter(t => !t.category_id).length

  const visible = useMemo(
    () => (onlyUncategorised ? txns.filter(t => !t.category_id) : txns),
    [txns, onlyUncategorised]
  )

  // How many transactions share each merchant, so a row can offer a bulk apply.
  const merchantCounts = useMemo(() => {
    const m: Record<string, number> = {}
    txns.forEach(t => {
      if (!t.description) return
      const k = normalizeDescription(t.description)
      m[k] = (m[k] || 0) + 1
    })
    return m
  }, [txns])

  const total = txns.reduce((s, t) => s + t.amount, 0)

  const grouped = visible.reduce((acc, t) => {
    const d = t.date
    if (!acc[d]) acc[d] = []
    acc[d].push(t)
    return acc
  }, {} as Record<string, Transaction[]>)
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Transactions</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setDate(d => subMonths(d, 1))} className="btn-ghost px-3 py-1">&#8592;</button>
          <span className="text-blue font-semibold min-w-[130px] text-center">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => setDate(d => addMonths(d, 1))} className="btn-ghost px-3 py-1">&#8594;</button>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Expense</button>
      </div>

      {error && (
        <div className="text-red text-sm bg-red/10 border border-red/30 rounded-lg px-4 py-3 mb-5">
          {error}
        </div>
      )}

      {notice && (
        <div className="text-green text-sm bg-green/10 border border-green/30 rounded-lg px-4 py-3 mb-5">
          {notice}
        </div>
      )}

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="card p-4">
          <div className="text-xs text-text-muted mb-1">Total Spent</div>
          <div className="text-2xl font-bold text-red">{fmt(total)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-text-muted mb-1">Transactions</div>
          <div className="text-2xl font-bold text-text-primary">{txns.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-text-muted mb-1">Avg per Transaction</div>
          <div className="text-2xl font-bold text-yellow">{txns.length > 0 ? fmt(total / txns.length) : '--'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-text-muted mb-1">Uncategorised</div>
          <div className={`text-2xl font-bold ${uncategorisedCount > 0 ? 'text-yellow' : 'text-green'}`}>
            {uncategorisedCount}
          </div>
        </div>
      </div>

      {uncategorisedCount > 0 && (
        <div className="flex items-center justify-between bg-yellow/10 border border-yellow/30 rounded-lg px-4 py-2 mb-5">
          <span className="text-yellow text-xs">
            {uncategorisedCount} transaction{uncategorisedCount === 1 ? '' : 's'} have no category and
            count toward no budget line.
          </span>
          <button
            onClick={() => setOnlyUncategorised(v => !v)}
            className="btn-ghost text-xs py-1 px-3"
          >
            {onlyUncategorised ? 'Show all' : 'Show only these'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-text-muted text-center py-20">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-base font-medium mb-1">
            {onlyUncategorised ? 'Everything is categorised' : 'No transactions yet'}
          </div>
          {onlyUncategorised ? (
            <button onClick={() => setOnlyUncategorised(false)} className="btn-ghost mt-3">Show all</button>
          ) : (
            <>
              <div className="text-sm mb-4">Add your first expense for {format(date, 'MMMM yyyy')}</div>
              <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Expense</button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(d => {
            const dayTxns = grouped[d]
            const dayTotal = dayTxns.reduce((s, t) => s + t.amount, 0)
            return (
              <div key={d} className="card">
                <div className="card-head">
                  <span className="text-sm font-semibold text-text-primary">
                    {format(parseISO(d), 'EEEE, MMMM d')}
                  </span>
                  <span className="text-sm font-semibold text-red">{fmt(dayTotal)}</span>
                </div>
                <div className="divide-y divide-muted">
                  {dayTxns.map(t => {
                    const cat = t.category as Category | null
                    const similar = t.description ? merchantCounts[normalizeDescription(t.description)] ?? 1 : 1
                    return (
                      <div key={t.id} className={`px-4 py-3 ${!t.category_id ? 'bg-yellow/5' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="text-xl w-8 text-center flex-shrink-0">
                            {cat?.icon || '💳'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate" title={t.description || ''}>
                              {t.description || cat?.name || 'Uncategorised'}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">{t.payment_method}</div>
                          </div>
                          <div className="text-base font-bold text-text-primary flex-shrink-0">
                            {fmt(t.amount)}
                          </div>
                          <button
                            onClick={() => deleteTransaction(t.id)}
                            disabled={deleting === t.id}
                            className="btn-danger flex-shrink-0"
                          >
                            {deleting === t.id ? '...' : 'Del'}
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-2 pl-11 flex-wrap">
                          <select
                            value={t.category_id ?? ''}
                            onChange={e => setCategory(t, e.target.value || null)}
                            disabled={saving === t.id}
                            className="inp text-xs py-1 min-w-[190px]"
                          >
                            <option value="">-- no category --</option>
                            {(['fixed', 'food', 'variable'] as const).map(type => {
                              const group = cats.filter(c => c.type === type)
                              if (group.length === 0) return null
                              const label = type === 'fixed' ? 'Fixed Bills'
                                : type === 'food' ? 'Food' : 'Variable Spending'
                              return (
                                <optgroup key={type} label={label}>
                                  {group.map(c => (
                                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                  ))}
                                </optgroup>
                              )
                            })}
                          </select>

                          {t.category_id && similar > 1 && (
                            <button
                              onClick={() => applyToMerchant(t, t.category_id!)}
                              disabled={saving === t.id}
                              className="btn-ghost text-xs py-1 px-2"
                              title="Apply this category to every transaction from this merchant, and remember it"
                            >
                              {saving === t.id ? '...' : `Apply to all ${similar}`}
                            </button>
                          )}

                          {saving === t.id && <span className="text-xs text-text-muted">Saving...</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="flex justify-between items-center px-4 py-3 bg-surface border border-border rounded-lg">
            <span className="font-semibold text-text-primary">Month Total</span>
            <span className="text-xl font-bold text-red">{fmt(total)}</span>
          </div>
        </div>
      )}

      {showAdd && <AddTransactionModal categories={cats} onClose={() => setShowAdd(false)} onSaved={load} />}
    </div>
  )
}
