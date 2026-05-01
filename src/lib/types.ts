export type CategoryType = 'fixed' | 'food' | 'variable'
export type IncomeSource = 'salary' | 'client' | 'reimbursement' | 'other'

export interface Category {
  id: string
  name: string
  icon: string
  type: CategoryType
  monthly_target: number
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Transaction {
  id: string
  date: string
  category_id: string | null
  amount: number
  description: string | null
  payment_method: string
  created_at: string
  category?: Category
}

export interface IncomeEntry {
  id: string
  date: string
  amount: number
  source: IncomeSource
  description: string | null
  created_at: string
}

export interface CCSnapshot {
  id: string
  date: string
  card_key: string
  card_name: string
  balance: number
  created_at: string
}

export interface CCCard {
  id: string
  key: string
  name: string
  bank: string
  apr: number
  start_balance: number
  balance: number
  min_payment: number
  color: string
  note: string | null
  deadline: string | null
  sort_order: number
  created_at?: string
}
