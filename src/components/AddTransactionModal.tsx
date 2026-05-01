'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { Category } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/constants'

interface Props {
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}

export default function AddTransactionModal({ categories, onClose, onSaved }: Props) {
  const [date, setDate]    = useState(format(new Date(), 'yyyy-MM-dd'))
  const [catId, setCatId]  = useState('')
  const [amount, setAmount]= useState('')
  const [desc, setDesc]    = useState('')
  const [method, setMethod]= useState('Bank')
  const [saving, setSaving]= useState(false)
  const [error, setError]  = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    const { error: err } = await supabase.from('transactions').insert({
      date,
      category_id: catId || null,
      amount: parseFloat(amount),
      description: desc || null,
      payment_method: method,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const fixed = categories.filter(c => c.type === 'fixed')
  const food  = categories.filter(c => c.type === 'food')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md">
        <div className="card-head">
          <h2 className="font-semibold text-text-primary">Add Expense</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          {error && <div className="text-red text-sm bg-red/10 border border-red/30 rounded px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                     className="inp w-full" required />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                     className="inp w-full" placeholder="0.00" step="0.01" min="0" required />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">Category</label>
            <select value={catId} onChange={e => setCatId(e.target.value)} className="inp w-full">
              <option value="">-- No category --</option>
              <optgroup label="Fixed Bills">
                {fixed.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </optgroup>
              <optgroup label="Food">
                {food.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">Description (optional)</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
                   className="inp w-full" placeholder="e.g. Econo grocery run" />
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">Paid with</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="inp w-full">
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : 'Save Expense'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
