'use client'
import { useEffect, useState } from 'react'
import { format, subMonths, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { CCCard } from '@/lib/types'
import { fmt } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line
} from 'recharts'

interface MonthSummary {
  month: string
  label: string
  income: number
  fixed: number
  food: number
  total: number
  net: number
}

interface CCHistory {
  month: string
  label: string
  [key: string]: string | number
}

export default function HistoryPage() {
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([])
  const [ccHistory, setCCHistory] = useState<CCHistory[]>([])
  const [cards, setCards] = useState<CCCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Build last 12 months
      const months: { key: string; label: string; start: string; end: string }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = subMonths(new Date(2026, 4, 1), i)
        const key = format(d, 'yyyy-MM')
        const start = key + '-01'
        const end = format(new Date(d.getFullYear(), d.getMonth() + 1, 0), 'yyyy-MM-dd')
        months.push({ key, label: format(d, 'MMM yy'), start, end })
      }

      const [{ data: txns }, { data: income }, { data: snapshots }, { data: cardData }] = await Promise.all([
        supabase.from('transactions')
          .select('date, amount, category:categories(type)')
          .gte('date', months[0].start)
          .lte('date', months[months.length - 1].end),
        supabase.from('income_entries')
          .select('date, amount')
          .gte('date', months[0].start)
          .lte('date', months[months.length - 1].end),
        supabase.from('cc_snapshots')
          .select('*')
          .order('date', { ascending: false })
          .limit(500),
        supabase.from('cc_cards').select('*').order('sort_order'),
      ])
      const loadedCards = cardData || []
      setCards(loadedCards)

      // Build month summaries
      const summaries: MonthSummary[] = months.map(m => {
        const monthTxns = (txns || []).filter(t => t.date.startsWith(m.key))
        const monthIncome = (income || []).filter(i => i.date.startsWith(m.key))
        const totalIncome = monthIncome.reduce((s, i) => s + i.amount, 0)
        const fixed = monthTxns
          .filter(t => (t.category as unknown as { type: string } | null)?.type === 'fixed')
          .reduce((s, t) => s + t.amount, 0)
        const food = monthTxns
          .filter(t => (t.category as unknown as { type: string } | null)?.type === 'food')
          .reduce((s, t) => s + t.amount, 0)
        const total = monthTxns.reduce((s, t) => s + t.amount, 0)
        return {
          month: m.key,
          label: m.label,
          income: totalIncome,
          fixed,
          food,
          total,
          net: totalIncome - total,
        }
      })
      setMonthSummaries(summaries)

      // Build CC history by month
      const ccByMonth: Record<string, Record<string, number>> = {}
      ;(snapshots || []).forEach(s => {
        const m = s.date.slice(0, 7)
        if (!ccByMonth[m]) ccByMonth[m] = {}
        if (!(s.card_key in ccByMonth[m])) ccByMonth[m][s.card_key] = s.balance
      })

      const ccRows: CCHistory[] = months.map(m => {
        const row: CCHistory = { month: m.key, label: m.label }
        const data = ccByMonth[m.key]
        loadedCards.forEach((c: CCCard) => {
          row[c.key] = data?.[c.key] ?? 0
        })
        row.total = data ? loadedCards.reduce((s: number, c: CCCard) => s + (data[c.key] ?? 0), 0) : 0
        return row
      })
      setCCHistory(ccRows)

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="text-text-muted text-center py-20">Loading history...</div>
  }

  const hasSpending = monthSummaries.some(m => m.total > 0)
  const hasCC = ccHistory.some(m => (m.total as number) > 0)

  // Rolling totals
  const totalIncome  = monthSummaries.reduce((s, m) => s + m.income, 0)
  const totalSpent   = monthSummaries.reduce((s, m) => s + m.total, 0)
  const totalNet     = totalIncome - totalSpent
  const avgMonthly   = monthSummaries.filter(m => m.total > 0).length > 0
    ? totalSpent / monthSummaries.filter(m => m.total > 0).length
    : 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">History</h1>
        <p className="text-xs text-text-muted mt-1">Last 12 months</p>
      </div>

      {/* Rolling KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-4 text-center">
          <div className="text-xs text-text-muted mb-1">Total Income</div>
          <div className="text-xl font-bold text-green">{fmt(totalIncome)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-text-muted mb-1">Total Spent</div>
          <div className="text-xl font-bold text-red">{fmt(totalSpent)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-text-muted mb-1">Net Saved</div>
          <div className={`text-xl font-bold ${totalNet >= 0 ? 'text-green' : 'text-red'}`}>{fmt(totalNet)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-text-muted mb-1">Avg/Month</div>
          <div className="text-xl font-bold text-yellow">{avgMonthly > 0 ? fmt(Math.round(avgMonthly)) : '--'}</div>
        </div>
      </div>

      {/* Monthly spending chart */}
      <div className="card mb-6">
        <div className="card-head">
          <h2 className="font-semibold text-sm">Monthly Spending Breakdown</h2>
          <span className="text-xs text-text-muted">Fixed vs Food vs Other</span>
        </div>
        <div className="p-4" style={{ height: 280 }}>
          {hasSpending ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthSummaries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="label" tick={{ fill: '#7d8590', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7d8590', fontSize: 11 }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'K'} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}
                  labelStyle={{ color: '#f0f6fc' }}
                  formatter={(v: number) => ['$' + v?.toLocaleString(), '']}
                />
                <Legend wrapperStyle={{ color: '#8b949e', fontSize: 12 }} />
                <Bar dataKey="fixed" name="Fixed" stackId="a" fill="#58a6ff" radius={[0, 0, 0, 0]} />
                <Bar dataKey="food"  name="Food"  stackId="a" fill="#3fb950" radius={[0, 0, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="#f85149" radius={[4, 4, 0, 0]} hide />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              No spending data yet -- add transactions to see trends
            </div>
          )}
        </div>
      </div>

      {/* Income vs spending line chart */}
      <div className="card mb-6">
        <div className="card-head">
          <h2 className="font-semibold text-sm">Income vs Spending</h2>
          <span className="text-xs text-text-muted">Green = surplus, Red = deficit</span>
        </div>
        <div className="p-4" style={{ height: 260 }}>
          {hasSpending ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthSummaries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="label" tick={{ fill: '#7d8590', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7d8590', fontSize: 11 }} tickFormatter={v => '$' + (v / 1000).toFixed(1) + 'K'} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}
                  labelStyle={{ color: '#f0f6fc' }}
                  formatter={(v: number) => ['$' + v?.toLocaleString(), '']}
                />
                <Legend wrapperStyle={{ color: '#8b949e', fontSize: 12 }} />
                <Line type="monotone" dataKey="income" stroke="#3fb950" strokeWidth={2.5} dot={{ r: 3 }} name="Income" connectNulls={false} />
                <Line type="monotone" dataKey="total"  stroke="#f85149" strokeWidth={2.5} dot={{ r: 3 }} name="Spent"  connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* CC debt trend */}
      <div className="card mb-6">
        <div className="card-head">
          <h2 className="font-semibold text-sm">Credit Card Balance Trend</h2>
          <span className="text-xs text-text-muted">Save monthly from CC Tracker to populate</span>
        </div>
        <div className="p-4" style={{ height: 260 }}>
          {hasCC ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ccHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="label" tick={{ fill: '#7d8590', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7d8590', fontSize: 11 }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'K'} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}
                  labelStyle={{ color: '#f0f6fc' }}
                  formatter={(v: number) => ['$' + v?.toLocaleString(), '']}
                />
                <Legend wrapperStyle={{ color: '#8b949e', fontSize: 12 }} />
                {cards.map(c => (
                  <Line key={c.key} type="monotone" dataKey={c.key} stroke={c.color}
                    strokeWidth={2} dot={{ r: 3 }} name={c.name.split(' ')[0]} connectNulls={false} />
                ))}
                <Line type="monotone" dataKey="total" stroke="#8b949e" strokeDasharray="4 3"
                  strokeWidth={1.5} dot={false} name="Total" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              No CC snapshots yet -- save balances from the CC Tracker page
            </div>
          )}
        </div>
      </div>

      {/* Monthly summary table */}
      <div className="card">
        <div className="card-head">
          <h2 className="font-semibold text-sm">Monthly Summary Table</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg text-text-muted text-xs">
                <th className="px-4 py-3 text-left font-semibold">Month</th>
                <th className="px-4 py-3 text-right font-semibold">Income</th>
                <th className="px-4 py-3 text-right font-semibold">Fixed</th>
                <th className="px-4 py-3 text-right font-semibold">Food</th>
                <th className="px-4 py-3 text-right font-semibold">Total Spent</th>
                <th className="px-4 py-3 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {monthSummaries.map(m => (
                <tr key={m.month} className="border-t border-muted">
                  <td className="px-4 py-2.5 font-medium text-text-primary">{m.label}</td>
                  <td className="px-4 py-2.5 text-right text-green">{m.income > 0 ? fmt(m.income) : '--'}</td>
                  <td className="px-4 py-2.5 text-right text-text-muted">{m.fixed > 0 ? fmt(m.fixed) : '--'}</td>
                  <td className="px-4 py-2.5 text-right text-text-muted">{m.food > 0 ? fmt(m.food) : '--'}</td>
                  <td className="px-4 py-2.5 text-right text-red">{m.total > 0 ? fmt(m.total) : '--'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${
                    m.net > 0 ? 'text-green' : m.net < 0 ? 'text-red' : 'text-text-muted'
                  }`}>
                    {m.income > 0 || m.total > 0
                      ? (m.net >= 0 ? '+' : '') + fmt(m.net)
                      : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
