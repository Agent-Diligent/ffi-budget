import { CCCardConfig } from './types'

export const CC_CARDS: CCCardConfig[] = [
  {
    key: 'capone', name: 'Capital One Venture', bank: 'Capital One · 1202',
    apr: 24.40, startBalance: 4763, maxBalance: 10963, minPayment: 308,
    color: '#f85149', deadline: null, note: 'Highest APR -- kill first',
  },
  {
    key: 'citi', name: 'Costco Anywhere Visa', bank: 'Citi · 5268',
    apr: 22.74, startBalance: 3481, maxBalance: 3481, minPayment: 41,
    color: '#d29922', deadline: null, note: 'APR rising Jun 20 -- stop using',
  },
  {
    key: 'newpromo', name: '0% Promo (New BT)', bank: 'New Card',
    apr: 0, startBalance: 5000, maxBalance: 5000, minPayment: 50,
    color: '#3fb950', deadline: 'Aug 2027', note: '0% promo -- expires ~Aug 2027',
  },
  {
    key: 'oldpromo', name: '0% Promo (15K Card)', bank: 'Promo Card',
    apr: 0, startBalance: 15418, maxBalance: 15418, minPayment: 175,
    color: '#58a6ff', deadline: 'Dec 16, 2026', note: '$10,218 expires Dec 16, 2026!',
  },
]

export const TOTAL_CC_MINIMUMS = CC_CARDS.reduce((s, c) => s + c.minPayment, 0)

export const PAYOFF_TIMELINE = [
  { key: '2026-05', label: 'May 2026',  capone: 3359,  citi: 3440,  newpromo: 4950,  oldpromo: 15243 },
  { key: '2026-06', label: 'Jun 2026',  capone: 1926,  citi: 3464,  newpromo: 4900,  oldpromo: 15068 },
  { key: '2026-07', label: 'Jul 2026',  capone: 464,   citi: 3489,  newpromo: 4850,  oldpromo: 14893 },
  { key: '2026-08', label: 'Aug 2026',  capone: 0,     citi: 2656,  newpromo: 4800,  oldpromo: 14718 },
  { key: '2026-09', label: 'Sep 2026',  capone: 0,     citi: 1164,  newpromo: 4750,  oldpromo: 14543 },
  { key: '2026-10', label: 'Oct 2026',  capone: 0,     citi: 0,     newpromo: 4700,  oldpromo: 14053 },
  { key: '2026-11', label: 'Nov 2026',  capone: 0,     citi: 0,     newpromo: 4650,  oldpromo: 12336 },
  { key: '2026-12', label: 'Dec 2026',  capone: 0,     citi: 0,     newpromo: 4600,  oldpromo: 10619 },
  { key: '2027-01', label: 'Jan 2027',  capone: 0,     citi: 0,     newpromo: 3009,  oldpromo: 9188  },
  { key: '2027-02', label: 'Feb 2027',  capone: 0,     citi: 0,     newpromo: 1418,  oldpromo: 7872  },
  { key: '2027-03', label: 'Mar 2027',  capone: 0,     citi: 0,     newpromo: 0,     oldpromo: 7023  },
  { key: '2027-04', label: 'Apr 2027',  capone: 0,     citi: 0,     newpromo: 0,     oldpromo: 5591  },
  { key: '2027-05', label: 'May 2027',  capone: 0,     citi: 0,     newpromo: 0,     oldpromo: 4160  },
  { key: '2027-06', label: 'Jun 2027',  capone: 0,     citi: 0,     newpromo: 0,     oldpromo: 2730  },
  { key: '2027-07', label: 'Jul 2027',  capone: 0,     citi: 0,     newpromo: 0,     oldpromo: 1300  },
  { key: '2027-08', label: 'Aug 2027',  capone: 0,     citi: 0,     newpromo: 0,     oldpromo: 0     },
]

export const MILESTONES: Record<string, string> = {
  '2026-08': 'Capital One PAID',
  '2026-10': 'Citi PAID',
  '2026-12': 'Promo Expires!',
  '2027-03': '6K Promo PAID',
  '2027-08': 'DEBT FREE',
}

export const SOURCE_LABELS: Record<string, string> = {
  salary: 'Salary',
  client: 'Client Revenue',
  reimbursement: 'Reimbursement',
  other: 'Other',
}

export const PAYMENT_METHODS = ['Bank', 'Capital One', 'Citi', 'Promo Card', 'Cash']
