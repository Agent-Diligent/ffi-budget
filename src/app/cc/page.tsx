'use client'
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { CCSnapshot } from '@/lib/types'
import { CC_CARDS, PAYOFF_TIMELINE, MILESTONES } from '@/lib/constants'
import { fmt, clamp } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const CURRENT_MONTH = format(new Date(2026, 4, 1), 'yyyy-MM')

export default function CCTrackerPage() {
  const [snapshots, setSnapshots] = useState<CCSnapshot[]>([])
  const [inputs, setInputs]       = useState<Record<string, string>>(
    Object.fromEntries(CC_CARDS.map(c => [c.key, String(c.startBalance)]))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('cc_snapshots')
      .select('*').order('date', { ascending: false }).limit(200)
    setSnapshots(data || [])

    const latest: Record<string, number> = {}
    ;(data || []).forEach(s => {
      if (!(s.card_key in latest)) latest[s.card_key] = s.balance
    })
    setInputs(Object.fromEntries(CC_CARDS.map(c => [c.key, String(latest[c.key] ?? c.startBalance)])))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveBalances() {
    setSaving(true)
    await Promise.all(CC_CARDS.map(card =>
      supabase.from('cc_snapshots').insert({
        date: TODAY, card_key: card.key,
        card_name: card.name,
        balance: parseFloat(inputs[card.key]) || 0,
      })
    ))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    load()
  }

  // Build chart data: projected vs actual by month
  const actualByMonth: Record<string, Record<string, number>> = {}
  snapshots.forEach(s => {
    const m = s.date.slice(0, 7)
    if (!actualByMonth[m]) actualByMonth[m] = {}
    if (!(s.card_key in actualByMonth[m])) actualByMonth[m][s.card_key] = s.balance
  })

  const chartData = PAYOFF_TIMELINE.map(row => {
    const projected = row.capone + row.citi + row.newpromo + row.oldpromo
    const actuals = actualByMonth[row.key]
    const actual = actuals
      ? CC_CARDS.reduce((s, c) => s + (actuals[c.key] ?? 0), 0)
      : null
    return { month: row.label, projected, actual }
  })

  const totalDebt = CC_CARDS.reduce((s, c) => s + (parseFloat(inputs[c.key]) || 0), 0)
  const monthlyInterest = CC_CARDS.reduce((s, c) => s + (parseFloat(inputs[c.key]) || 0) * (c.apr / 100 / 12), 0)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">CC Tracker</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green text-sm font-medium">Saved!</span>}
          <button onClick={saveBalances} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Current Balances'}
          </button>
        </div>
      </div>

      {/* CC Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {CC_CARDS.map(card => {
          const bal = parseFloat(inputs[card.key]) || 0
          const paid = clamp(((card.maxBalance - bal) / card.maxBalance) * 100, 0, 100)
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
                      <span className={`badge ml-1 ${card.deadline === 'Dec 16, 2026' ? 'badge-red' : 'badge-yellow'}`}>
                        Expires {card.deadline}
                      </span>
                    )}
                  </div>
                </div>
                <input
                  type="number" value={inputs[card.key]}
                  onChange={e => setInputs(p => ({ ...p, [card.key]: e.target.value }))}
                  className="inp w-32 text-right text-xl font-bold"
                />
              </div>
              <div className="progress-bar mb-2">
                <div className="progress-fill" style={{ width: `${paid}%`, background: card.color }} />
              </div>
              <div className="flex justify-between text-xs text-text-muted">
                <span>{Math.round(paid)}% paid down from {fmt(card.maxBalance)}</span>
                <span>{card.apr > 0 ? <span className="text-red">~{fmt(Math.round(interest))}/mo interest</span> : 'No interest'}</span>
              </div>
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
          <div className="text-2xl font-bold text-blue">{fmt(CC_CARDS.reduce((s,c) => s+c.minPayment, 0))}</div>
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
      <div className="card">
        <div className="card-head">
          <h2 className="font-semibold text-sm">Month-by-Month Payoff Plan</h2>
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
      {!loading && snapshots.length > 0 && (
        <div className="card mt-5">
          <div className="card-head">
            <h2 className="font-semibold text-sm">Balance History Log</h2>
            <span className="text-xs text-text-muted">{snapshots.length / CC_CARDS.length} snapshots</span>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg">
                <tr className="text-text-muted text-xs">
                  <th className="px-4 py-2 text-left">Date</th>
                  {CC_CARDS.map(c => <th key={c.key} className="px-4 py-2 text-right">{c.name.split(' ')[0]}</th>)}
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
                    const total = CC_CARDS.reduce((s, c) => s + (bals[c.key] || 0), 0)
                    return (
                      <tr key={date} className="border-t border-muted">
                        <td className="px-4 py-2 text-text-secondary">{format(parseISO(date), 'MMM d, yyyy')}</td>
                        {CC_CARDS.map(c => (
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
    </div>
  )
}
