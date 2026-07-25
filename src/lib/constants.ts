// PAYOFF_TIMELINE and MILESTONES used to live here as a hand-tabulated plan.
// The projection is now computed from live card data in payoffCalculator.ts,
// so the static tables were dead weight that could drift from reality.

export const SOURCE_LABELS: Record<string, string> = {
  salary: 'Salary',
  client: 'Client Revenue',
  reimbursement: 'Reimbursement',
  other: 'Other',
}

export const PAYMENT_METHODS = ['Bank', 'Capital One', 'Citi', 'Promo Card', 'Cash']
