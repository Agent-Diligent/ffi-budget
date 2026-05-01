'use client'
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { CCCard, CCSnapshot } from '@/lib/types'
import { PAYOFF_TIMELINE, MILESTONES } from '@/lib/constants'
import { fmt, clamp } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const CURRENT_MONTH = format(new Date(2026, 4, 1), 'yyyy-MM')
const COLORS = ['#f85149','#d29922','#3fb950','#58a6ff','#bc8cff','#39c5cf','#ffa657','#ff7b72']
const BLANK = { name: '', bank: '', apr: '', balance: '', min_payment: '', color: '#58a6ff', note: '', deadline: '' }

export default function CCTrackerPage() {
  const [cards, setCards]         = useState<CCCard[]>([])
  const [snapshots, setSnaps]     = useState<CCSnapshot[]>([])
  const [inputs, setInputs]       = useState<Record<string, string>>({})
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [form, setForm]           = useState({ ...BLANK })
  const [addSaving, setAddSaving] = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: cardData }, { data: snapData }] = await Promise.all([
      supabase.from('cc_cards').select('*').order('sort_order'),
      supabase.from('cc_snapshots').select('*').order('date', { ascending: false }).limit(200),
    ])
    const loaded = cardData || []
    setCards(loaded)
    setSnaps(snapData || [])
    setInputs(Object.fromEntries(loaded.map((c: CCCard) => [c.key, String(c.balance)])))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveBalances() {
    setSaving(true)
    await Promise.all(cards.map(card => {
      const bal = parseFloat(inputs[card.key]) || 0
      return Promise.all([
        supabase.from('cc_snapshots').insert({ date: TODAY, card_key: card.key, card_name: card.name, balance: bal }),
        supabase.from('cc_cards').update({ balance: bal }).eq('id', card.id),
      ])
    }))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    load()
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault()
    setAddSaving(true)
    const bal = parseFloat(form.balance) || 0
    const key = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      + '_' + Date.now().toString().slice(-4)
    await supabase.from('cc_cards').insert({
      key, name: form.name, bank: form.bank || '',
      apr: parseFloat(form.apr) || 0,
      start_balance: bal, balance: bal,
      min_payment: parseFloat(form.min_payment) || 25,
      color: form.color, note: form.note || '',
      deadline: form.deadline || null,
      sort_order: cards.length + 1,
    })
    setAddSaving(false)
    setShowAdd(false)
    setForm({ ...BLANK })
    load()
  }

  async function deleteCard(id: string) {
    if (!confirm('Delete this card? Snapshot history will be kept.')) return
    setDeleting(id)
    await supabase.from('cc_cards').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  // Chart data (projected from original plan vs actual saved snapshots)
  const actualByMonth: Record<string, Record<string, number>> = {}
  snapshots.forEach(s => {
    const m = s.date.slice(0, 7)
    if (!actualByMonth[m]) actualByMonth[m] = {}
    if (!(s.card_key in actualByMonth[m])) actualByMonth[m][s.card_key] = s.balance
  })

  const chartData = PAYOFF_TIMELINE.map(row => {
    const projected = row.capone + row.citi + row.newpromo + row.oldpromo
    const actuals = actualByMonth[row.key]
    const actual = actuals ? cards.reduce((s, c) => s + (actuals[c.key] ?? 0), 0) : null
    return { month: row.label, projected, actual }
  })

  const totalDebt       = cards.reduce((s, c) => s + (parseFloat(inputs[c.key]) || 0), 0)
  const monthlyInterest = cards.reduce((s, c) => s + (parseFloat(inputs[c.key]) || 0) * (c.apr / 100 / 12), 0)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">CC Tracker</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green text-sm font-medium">Saved!</span>}
          <button onClick={() => setShowAdd(v => !v)} className="btn-ghost">
            {showAdd ? 'Cancel' : '+ Add Card'}
          </button>
          <button onClick={saveBalances} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Balances'}
          </button>
        </div>
      </div>

      {/* Add Card Form */}
      {showAdd && (
        <div className="card mb-6 p-5">
          <h3 className="font-semibold text-sm mb-4">Add New Card</h3>
          <form onSubmit={addCard} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-text-muted mb-1 block">Card Name *</label>
              <input type="text" required value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="inp w-full" placeholder="e.g. Chase Sapphire" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Bank / Issuer</label>
              <input type="text" value={form.bank}
                onChange={e => setForm(p => ({ ...p, bank: e.target.value }))}
                className="inp w-full" placeholder="e.g. Chase" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">APR % *</label>
              <input type="number" required value={form.apr} step="0.01" min="0"
                onChange={e => setForm(p => ({ ...p, apr: e.target.value }))}
                className="inp w-full" placeholder="0 for promo" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Current Balance ($) *</label>
              <input type="number" required value={form.balance} step="0.01" min="0"
                onChange={e => setForm(p => ({ ...p, balance: e.target.value }))}
                className="inp w-full" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Min Payment ($) *</label>
              <input type="number" required value={form.min_payment} step="0.01" min="0"
                onChange={e => setForm(p => ({ ...p, min_payment: e.target.value }))}
                className="inp w-full" placeholder="25.00" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Promo Deadline</label>
              <input type="text" value={form.deadline}
                onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
                className="inp w-full" placeholder="e.g. Dec 2027" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Note</label>
              <input type="text" value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                className="inp w-full" placeholder="optional" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Color</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {COLORS.map(c => (
                  <button key={c} type="button"
                    onClick={() => setForm(p => ({ ...p, color: c }))}
                    className="w-6 h-6 rounded-full border-2 transition-all"
                    style={{ background: c, borderColor: form.color === c ? '#fff' : 'transparent' }} />
                ))}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3 flex gap-3 pt-1">
              <button type="submit" disabled={addSaving} className="btn-primary">
                {addSaving ? 'Adding...' : 'Add Card'}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setForm({ ...BLANK }) }} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-text-muted text-center py-20">Loading...</div>
      ) : (
        <>
          {/* CC Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {cards.map(card => {
              const bal = parseFloat(inputs[card.key]) || 0
              const paid = card.start_balance > 0
                ? clamp(((card.start_balance - bal) / card.start_balance) * 100, 0, 100)
                : 0
              const interest = bal * (card.apr / 100 / 12)
              return (
                <div key={card.key} className="card p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-semibold text-text-primary">{card.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">{card.bank}</div>
                      <div className="text-xs mt-1">
                        {card.apr > 0
                          ? <span className="badge badge-red">{card.apr}% APR</span>
                          : <span className="badge badge-blue">0% Promo</span>}
                        {card.deadline && (
                          <span className={`badge ml-1 ${card.deadline.includes('2026') ? 'badge-red' : 'badge-yellow'}`}>
                            Expires {card.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" value={inputs[card.key] ?? ''}
                        onChange={e => setInputs(p => ({ ...p, [card.key]: e.target.value }))}
                        className="inp w-32 text-right text-xl font-bold"
                      />
                      <button
                        onClick={() => deleteCard(card.id)}
                        disabled={deleting === card.id}
                        className="text-text-muted hover:text-red text-xl leading-none transition-colors"
                        title="Delete card"
                      >
                        {deleting === card.id ? '...' : '×'}
                      </button>
                    </div>
                  </div>
                  <div className="progress-bar mb-2">
                    <div className="progress-fill" style={{ width: `${paid}%`, background: card.color }} />
                  </div>
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>{Math.round(paid)}% paid down from {fmt(card.start_balance)}</span>
                    <span>
                      {card.apr > 0
                        ? <span className="text-red">~{fmt(Math.round(interest))}/mo interest</span>
                        : 'No interest'}
                    </span>
                  </div>
                  {card.note && <div className="text-xs text-text-muted mt-1 italic">{card.note}</div>}
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="card p-4 text-center">
              <div className="text-xs text-text-muted mb-1">Total Debt</div>
              <div className="text-2xl font-bold text-red">{fmt(totalDebt)}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xs text-text-muted mb-1">Monthly Interest</div>
              <div className="text-2xl font-bold text-yellow">{fmt(Math.round(monthlyInterest))}</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xs text-text-muted mb-1">Total Minimums</div>
              <div className="text-2xl font-bold text-blue">{fmt(cards.reduce((s,c)=>s+c.min_payment,0))}</div>
            </div>
          </div>

          {/* Debt paydown chart */}
          <div className="card mb-6">
            <div className="card-head">
              <h2 className="font-semibold text-sm">Debt Paydown: Projected vs Actual</h2>
              <span className="text-xs text-text-muted">Save balances monthly to track actual</span>
            </div>
            <div className="p-4" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="month" tick={{ fill: '#7d8590', fontSize: 11 }} interval={2} />
                  <YAxis tick={{ fill: '#7d8590', fontSize: 11 }} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'K'} />
                  <Tooltip
                    contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}
                    labelStyle={{ color: '#f0f6fc' }}
                    formatter={(v: number) => ['$' + v?.toLocaleString(), '']}
                  />
                  <Legend wrapperStyle={{ color: '#8b949e', fontSize: 12 }} />
                  <Line type="monotone" dataKey="projected" stroke="#58a6ff" strokeDasharray="5 4" strokeWidth={2} dot={false} name="Projected" />
                  <Line type="monotone" dataKey="actual" stroke="#3fb950" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} name="Actual" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Payoff timeline table */}
          <div className="card mb-6">
            <div className="card-head">
              <h2 className="font-semibold text-sm">Month-by-Month Payoff Plan</h2>
              <span className="text-xs text-text-muted">Original 4-card projection</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg text-text-muted text-xs">
                    <th className="px-4 py-3 text-left font-semibold">Month</th>
                    <th className="px-4 py-3 text-right font-semibold">Cap One</th>
                    <th className="px-4 py-3 text-right font-semibold">Citi</th>
                    <th className="px-4 py-3 text-right font-semibold">6K Promo</th>
                    <th className="px-4 py-3 text-right font-semibold">15K Promo</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {PAYOFF_TIMELINE.map(row => {
                    const total = row.capone + row.citi + row.newpromo + row.oldpromo
                    const isCurrent = row.key === CURRENT_MONTH
                    const milestone = MILESTONES[row.key]
                    return (
                      <tr key={row.key}
                        className={`border-t border-muted ${isCurrent ? 'bg-blue/10' : milestone ? 'bg-green/5' : ''}`}>
                        <td className={`px-4 py-2.5 font-medium ${isCurrent ? 'text-blue' : 'text-text-primary'}`}>
                          {row.label}
                          {milestone && (
                            <span className={`ml-2 badge text-[10px] ${milestone.includes('!') ? 'badge-red' : milestone === 'DEBT FREE' ? 'badge-blue' : 'badge-green'}`}>
                              {milestone}
                            </span>
                          )}
                        </td>
                        {[row.capone, row.citi, row.newpromo, row.oldpromo].map((v, i) => (
                          <td key={i} className={`px-4 py-2.5 text-right ${v === 0 ? 'text-green font-bold' : 'text-text-muted'}`}>
                            {v === 0 ? 'PAID' : fmt(v)}
                          </td>
                        ))}
                        <td className={`px-4 py-2.5 text-right font-bold ${total === 0 ? 'text-green' : 'text-text-primary'}`}>
                          {total === 0 ? 'FREE!' : fmt(total)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Balance history */}
          {snapshots.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2 className="font-semibold text-sm">Balance History Log</h2>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-bg">
                    <tr className="text-text-muted text-xs">
                      <th className="px-4 py-2 text-left">Date</th>
                      {cards.map(c => <th key={c.key} className="px-4 py-2 text-right">{c.name.split(' ')[0]}</th>)}
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const byDate: Record<string, Record<string, number>> = {}
                      snapshots.forEach(s => {
                        if (!byDate[s.date]) byDate[s.date] = {}
                        byDate[s.date][s.card_key] = s.balance
                      })
                      return Object.entries(byDate).sort((a,b) => b[0].localeCompare(a[0])).map(([date, bals]) => {
                        const total = cards.reduce((s, c) => s + (bals[c.key] || 0), 0)
                        return (
                          <tr key={date} className="border-t border-muted">
                            <td className="px-4 py-2 text-text-secondary">{format(parseISO(date), 'MMM d, yyyy')}</td>
                            {cards.map(c => (
                              <td key={c.key} className="px-4 py-2 text-right text-text-muted">
                                {bals[c.key] !== undefined ? fmt(bals[c.key]) : '--'}
                              </td>
                            ))}
                            <td className="px-4 py-2 text-right font-semibold text-text-primary">{fmt(total)}</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
