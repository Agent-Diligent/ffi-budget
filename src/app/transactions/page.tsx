'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { Category, Transaction } from '@/lib/types'
import { fmt, getMonthRange } from '@/lib/utils'
import AddTransactionModal from '@/components/AddTransactionModal'

export default function TransactionsPage() {
  const [date, setDate]      = useState(new Date(2026, 4, 1))
  const [cats, setCats]      = useState<Category[]>([])
  const [txns, setTxns]      = useState<Transaction[]>([])
  const [loading, setLoading]= useState(true)
  const [showAdd, setShowAdd]= useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { start, end } = getMonthRange(date)
    const [{ data: catData }, { data: txnData }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('transactions').select('*, category:categories(*)').gte('date', start).lte('date', end).order('date', { ascending: false }),
    ])
    setCats(catData || [])
    setTxns(txnData || [])
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  async function deleteTransaction(id: string) {
    setDeleting(id)
    await supabase.from('transactions').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  const total = txns.reduce((s, t) => s + t.amount, 0)

  // Group by date
  const grouped = txns.reduce((acc, t) => {
    const d = t.date
    if (!acc[d]) acc[d] = []
    acc[d].push(t)
    return acc
  }, {} as Record<string, Transaction[]>)
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Transactions</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setDate(d => subMonths(d, 1))} className="btn-ghost px-3 py-1">&#8592;</button>
          <span className="text-blue font-semibold min-w-[130px] text-center">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => setDate(d => addMonths(d, 1))} className="btn-ghost px-3 py-1">&#8594;</button>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Expense</button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
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
      </div>

      {loading ? (
        <div className="text-text-muted text-center py-20">Loading...</div>
      ) : txns.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-base font-medium mb-1">No transactions yet</div>
          <div className="text-sm mb-4">Add your first expense for {format(date, 'MMMM yyyy')}</div>
          <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Expense</button>
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
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="text-xl w-8 text-center flex-shrink-0">
                          {cat?.icon || '💳'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text-primary">
                            {cat?.name || 'Uncategorized'}
                          </div>
                          {t.description && (
                            <div className="text-xs text-text-muted truncate">{t.description}</div>
                          )}
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
