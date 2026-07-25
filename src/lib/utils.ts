import { format, startOfMonth, endOfMonth } from 'date-fns'

export function fmt(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function fmtSigned(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function getMonthRange(date: Date): { start: string; end: string } {
  return {
    start: format(startOfMonth(date), 'yyyy-MM-dd'),
    end:   format(endOfMonth(date),   'yyyy-MM-dd'),
  }
}

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM')
}

/**
 * First day of the current month.
 *
 * Every page used to seed its month state with a hardcoded `new Date(2026, 4, 1)`,
 * so the whole app stayed pinned to May 2026 no matter what today's date was.
 */
export function currentMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export function progressColor(pct: number): string {
  if (pct <= 85)  return '#3fb950'
  if (pct <= 100) return '#d29922'
  return '#f85149'
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}
