'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { Category, Transaction, IncomeEntry } from '@/lib/types'
import { CC_CARDS, TOTAL_CC_MINIMUMS, SOURCE_LABELS } from '@/lib/constants'
import { fmt, fmtSigned, getMonthRange, progressColor, clamp } from '@/lib/utils'
import AddTransactionModal from '@/components/AddTransactionModal'

const INCOME_TARGET = 7750
const FOOD_TARGET   = 1325
const FIXED_TARGET  = 4658

export default function Dashboard() {
  const [date, setDate]      = useState(new Date(2026, 4, 1))
  const [cats, setCats]      = useState<Category[]>([])
  const [txns, setTxns]      = useState<Transaction[]>([])
  const [income, setIncome]  = useState<IncomeEntry[]>([])
  const [ccBals, setCcBals]  = useState<Record<string, number>>({})
  const [loading, setLoading]= useState(true)
  const [showAdd, setShowAdd]= useState(false)
  const [showIncome, setShowIncome] = useState(false)
  const [incForm, setIncForm]= useState({ source: 'salary', amount: '', desc: '' })
  const [ccInputs, setCcInputs] = useState<Record<string, string>>({})
  const [savingCC, setSavingCC] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { start, end } = getMonthRange(date)

    const [{ data: catData }, { data: txnData }, { data: incData }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('transactions').select('*, category:categories(*)').gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('income_entries').select('*').gte('date', start).lte('date', end).order('date', { ascending: false }),
    ])

    setCats(catData || [])
    setTxns(txnData || [])
    setIncome(incData || [])

    const bals: Record<string, number> = {}
    await Promise.all(CC_CARDS.map(async card => {
      const { data } = await supabase.from('cc_snapshots')
        .select('balance').eq('card_key', card.key)
        .lte('date', end).order('date', { ascending: false }).limit(1).maybeSingle()
      bals[card.key] = data?.balance ?? card.startBalance
    }))
    setCcBals(bals)
    setCcInputs(Object.fromEntries(CC_CARDS.map(c => [c.key, String(bals[c.key] ?? c.startBalance)])))
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  const catTotals = txns.reduce((acc, t) => {
    if (t.category_id) acc[t.category_id] = (acc[t.category_id] || 0) + t.amount
    return acc
  }, {} as Record<string, number>)

  const fixedCats = cats.filter(c => c.type === 'fixed')
  const foodCats  = cats.filter(c => c.type === 'food')
  const totalFixed  = fixedCats.reduce((s, c) => s + (catTotals[c.id] || 0), 0)
  const totalFood   = foodCats.reduce((s, c) => s + (catTotals[c.id] || 0), 0)
  const totalIncome = income.reduce((s, i) => s + i.amount, 0)
  const net         = totalIncome - totalFixed - totalFood - TOTAL_CC_MINIMUMS
  const totalDebt   = CC_CARDS.reduce((s, c) => s + (ccBals[c.key] || 0), 0)
  const monthlyInterest = CC_CARDS.reduce((s, c) => s + (ccBals[c.key] || 0) * (c.apr / 100 / 12), 0)

  async function saveIncome(e: React.FormEvent) {
    e.preventDefault()
    if (!incForm.amount) return
    await supabase.from('income_entries').insert({
      date: format(date, 'yyyy-MM-') + '01',
      amount: parseFloat(incForm.amount),
      source: incForm.source,
      description: incForm.desc || null,
    })
    setIncForm({ source: 'salary', amount: '', desc: '' })
    setShowIncome(false)
    load()
  }

  async function saveCCBalances() {
    setSavingCC(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    await Promise.all(CC_CARDS.map(card =>
      supabase.from('cc_snapshots').insert({
        date: today,
        card_key: card.key,
        card_name: card.name,
        balance: parseFloat(ccInputs[card.key]) || 0,
      })
    ))
    setSavingCC(false)
    load()
  }

  const isCurrentMonth = format(date, 'yyyy-MM') === '2026-05'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Alert */}
      {isCurrentMonth && (
        <div className="bg-red/10 border border-red/40 rounded-lg px-4 py-3 mb-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-red font-bold uppercase text-xs tracking-wide">Urgent</span>
          <span className="text-red/80"><strong className="text-red">May 12:</strong> Change Citi AutoPay to $41 min -- prevents $981 overdraft</span>
          <span className="text-red/80"><strong className="text-red">May 22:</strong> Capital One $308 min due</span>
          <span className="text-red/80"><strong className="text-red">This week:</strong> Submit hotel reimbursement ~$1,200</span>
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setDate(d => subMonths(d, 1))} className="btn-ghost px-3 py-1">&#8592;</button>
          <span className="text-blue font-semibold text-base min-w-[130px] text-center">{format(date, 'MMMM yyyy')}</span>
          <button onClick={() => setDate(d => addMonths(d, 1))} className="btn-ghost px-3 py-1">&#8594;</button>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Expense</button>
      </div>

      {loading ? (
        <div className="text-text-muted text-center py-20">Loading...</div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Income This Month', value: fmt(totalIncome), sub: `target ${fmt(INCOME_TARGET)}`, color: totalIncome >= INCOME_TARGET ? 'text-green' : 'text-yellow' },
              { label: 'Fixed Expenses',    value: fmt(totalFixed),  sub: `target ${fmt(FIXED_TARGET)}`,  color: totalFixed > FIXED_TARGET ? 'text-red' : 'text-yellow' },
              { label: 'Food Spending',     value: fmt(totalFood),   sub: `target ${fmt(FOOD_TARGET)}`,   color: totalFood > FOOD_TARGET ? 'text-red' : totalFood > 1000 ? 'text-yellow' : 'text-green' },
              { label: 'Net Cash Flow',     value: fmtSigned(net),   sub: 'after mins',                   color: net >= 0 ? 'text-green' : 'text-red' },
              { label: 'Total Debt',        value: fmt(totalDebt),   sub: `${fmt(Math.round(monthlyInterest))}/mo interest`, color: 'text-red' },
            ].map(k => (
              <div key={k.label} className="card p-4">
                <div className="text-xs text-text-muted uppercase tracking-wide mb-2">{k.label}</div>
                <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-text-muted mt-1">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

            {/* Budget Tracker */}
            <div className="card">
              <div className="card-head">
                <h2 className="font-semibold text-sm">Budget Tracker</h2>
                <span className="text-xs text-text-muted">{format(date, 'MMMM yyyy')}</span>
              </div>
              <div className="p-4 overflow-y-auto max-h-[480px]">
                <div className="text-xs text-text-muted uppercase tracking-wide mb-3">Fixed Bills</div>
                <div className="grid grid-cols-[1fr_60px_80px] gap-x-3 text-xs text-text-muted pb-2 border-b border-muted mb-1">
                  <span>Category</span><span className="text-right">Target</span><span className="text-right">Actual</span>
                </div>
                {fixedCats.map(cat => {
                  const actual = catTotals[cat.id] || 0
                  const pct = actual > 0 ? clamp((actual / cat.monthly_target) * 100, 0, 120) : 0
                  return (
                    <div key={cat.id} className="py-2 border-b border-muted last:border-0">
                      <div className="grid grid-cols-[1fr_60px_80px] gap-x-3 items-center mb-1">
                        <span className="text-sm text-text-primary">{cat.icon} {cat.name}</span>
                        <span className="text-xs text-text-muted text-right">{fmt(cat.monthly_target)}</span>
                        <span className={`text-sm font-semibold text-right ${actual > cat.monthly_target ? 'text-red' : actual > 0 ? 'text-green' : 'text-text-muted'}`}>
                          {actual > 0 ? fmt(actual) : '--'}
                        </span>
                      </div>
                      {actual > 0 && (
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${pct}%`, background: progressColor(pct) }} />
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="text-xs text-text-muted uppercase tracking-wide mt-4 mb-3">Food Budget</div>
                {foodCats.map(cat => {
                  const actual = catTotals[cat.id] || 0
                  const pct = actual > 0 ? clamp((actual / cat.monthly_target) * 100, 0, 120) : 0
                  return (
                    <div key={cat.id} className="py-2 border-b border-muted last:border-0">
                      <div className="grid grid-cols-[1fr_60px_80px] gap-x-3 items-center mb-1">
                        <span className="text-sm text-text-primary">{cat.icon} {cat.name}</span>
                        <span className="text-xs text-text-muted text-right">{fmt(cat.monthly_target)}</span>
                        <span className={`text-sm font-semibold text-right ${actual > cat.monthly_target ? 'text-red' : actual > 0 ? 'text-green' : 'text-text-muted'}`}>
                          {actual > 0 ? fmt(actual) : '--'}
                        </span>
                      </div>
                      {actual > 0 && (
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${pct}%`, background: progressColor(pct) }} />
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-border">
                  {[
                    { l: 'Fixed Target', v: fmt(FIXED_TARGET),  c: 'text-yellow' },
                    { l: 'Food Target',  v: fmt(FOOD_TARGET),   c: 'text-blue' },
                    { l: 'Food Actual',  v: fmt(totalFood),     c: totalFood > FOOD_TARGET ? 'text-red' : 'text-green' },
                  ].map(x => (
                    <div key={x.l} className="bg-bg rounded-lg p-3 text-center">
                      <div className="text-xs text-text-muted mb-1">{x.l}</div>
                      <div className={`text-base font-bold ${x.c}`}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column: CC + Income */}
            <div className="flex flex-col gap-5">

              {/* CC Tracker */}
              <div className="card">
                <div className="card-head">
                  <h2 className="font-semibold text-sm">Credit Card Balances</h2>
                  <button onClick={saveCCBalances} disabled={savingCC} className="btn-primary text-xs py-1 px-3">
                    {savingCC ? 'Saving...' : 'Save Balances'}
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  {CC_CARDS.map(card => {
                    const bal = parseFloat(ccInputs[card.key]) || 0
                    const paid = clamp(((card.maxBalance - bal) / card.maxBalance) * 100, 0, 100)
                    return (
                      <div key={card.key}>
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <div className="text-sm font-semibold text-text-primary">{card.name}</div>
                            <div className="text-xs text-text-muted">{card.bank} &bull; {card.apr > 0 ? card.apr + '% APR' : '0% promo'}</div>
                          </div>
                          <input
                            type="number" value={ccInputs[card.key] || ''}
                            onChange={e => setCcInputs(p => ({ ...p, [card.key]: e.target.value }))}
                            className="inp w-28 text-right text-lg font-bold"
                          />
                        </div>
                        <div className="progress-bar mb-1">
                          <div className="progress-fill" style={{ width: `${paid}%`, background: card.color }} />
                        </div>
                        <div className="flex justify-between text-xs text-text-muted">
                          <span>{Math.round(paid)}% paid down</span>
                          <span className={card.deadline === 'Dec 16, 2026' ? 'text-red font-semibold' : 'text-text-muted'}>
                            {card.deadline ? `Expires: ${card.deadline}` : card.note}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
                    <div className="bg-bg rounded p-2">
                      <div className="text-xs text-text-muted">High APR</div>
                      <div className="text-sm font-bold text-red">{fmt(CC_CARDS.filter(c=>c.apr>0).reduce((s,c)=>s+(ccBals[c.key]||0),0))}</div>
                    </div>
                    <div className="bg-bg rounded p-2">
                      <div className="text-xs text-text-muted">0% Promo</div>
                      <div className="text-sm font-bold text-blue">{fmt(CC_CARDS.filter(c=>c.apr===0).reduce((s,c)=>s+(ccBals[c.key]||0),0))}</div>
                    </div>
                    <div className="bg-bg rounded p-2">
                      <div className="text-xs text-text-muted">Interest/mo</div>
                      <div className="text-sm font-bold text-yellow">{fmt(Math.round(monthlyInterest))}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Income */}
              <div className="card">
                <div className="card-head">
                  <h2 className="font-semibold text-sm">Income This Month</h2>
                  <button onClick={() => setShowIncome(v => !v)} className="btn-ghost text-xs py-1 px-3">
                    {showIncome ? 'Cancel' : '+ Add'}
                  </button>
                </div>
                <div className="p-4">
                  {showIncome && (
                    <form onSubmit={saveIncome} className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border">
                      <select value={incForm.source} onChange={e => setIncForm(p => ({ ...p, source: e.target.value }))} className="inp flex-1 min-w-[120px]">
                        {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input type="number" value={incForm.amount} onChange={e => setIncForm(p => ({ ...p, amount: e.target.value }))}
                             className="inp w-28" placeholder="Amount" required />
                      <input type="text" value={incForm.desc} onChange={e => setIncForm(p => ({ ...p, desc: e.target.value }))}
                             className="inp flex-1 min-w-[140px]" placeholder="Description (optional)" />
                      <button type="submit" className="btn-primary">Save</button>
                    </form>
                  )}
                  {income.length === 0 ? (
                    <div className="text-text-muted text-sm text-center py-4">No income logged this month</div>
                  ) : (
                    <div className="space-y-2">
                      {income.map(i => (
                        <div key={i.id} className="flex justify-between items-center py-1">
                          <div>
                            <span className="text-sm text-text-primary font-medium">{SOURCE_LABELS[i.source]}</span>
                            {i.description && <span className="text-xs text-text-muted ml-2">{i.description}</span>}
                          </div>
                          <span className="text-green font-semibold">{fmt(i.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2 border-t border-border">
                        <span className="text-sm font-semibold text-text-primary">Total</span>
                        <span className="text-green font-bold text-lg">{fmt(totalIncome)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Net flow */}
          <div className={`rounded-xl p-4 flex justify-between items-center ${net >= 0 ? 'bg-green/10 border border-green/30' : 'bg-red/10 border border-red/30'}`}>
            <div>
              <div className="text-sm font-semibold text-text-primary">Monthly Net Cash Flow</div>
              <div className="text-xs text-text-muted mt-0.5">Income ({fmt(totalIncome)}) - Fixed ({fmt(totalFixed)}) - Food ({fmt(totalFood)}) - CC Mins ({fmt(TOTAL_CC_MINIMUMS)})</div>
            </div>
            <div className={`text-3xl font-bold ${net >= 0 ? 'text-green' : 'text-red'}`}>{fmtSigned(net)}</div>
          </div>
        </>
      )}

      {showAdd && <AddTransactionModal categories={cats} onClose={() => setShowAdd(false)} onSaved={load} />}
    </div>
  )
}
