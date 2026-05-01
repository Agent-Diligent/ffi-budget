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

export function progressColor(pct: number): string {
  if (pct <= 85)  return '#3fb950'
  if (pct <= 100) return '#d29922'
  return '#f85149'
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}
