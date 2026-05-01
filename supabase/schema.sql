-- FFI Budget Tracker Schema
-- Run this in your Supabase SQL Editor

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT DEFAULT '💰',
  type TEXT NOT NULL CHECK (type IN ('fixed', 'food', 'variable')),
  monthly_target DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (individual expenses)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  payment_method TEXT DEFAULT 'bank',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Income entries
CREATE TABLE income_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('salary','client','reimbursement','other')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CC balance snapshots (log whenever you update a balance)
CREATE TABLE cc_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  card_key TEXT NOT NULL,
  card_name TEXT NOT NULL,
  balance DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_income_date ON income_entries(date);
CREATE INDEX idx_cc_snapshots_card_date ON cc_snapshots(card_key, date DESC);

-- Seed default categories
INSERT INTO categories (name, icon, type, monthly_target, sort_order) VALUES
('Mortgage',               '🏠', 'fixed', 1600, 1),
('PREPA (Electric)',       '⚡', 'fixed',  288, 2),
('Water / Utilities',      '💧', 'fixed',  162, 3),
('Car Loan',               '🚗', 'fixed',  575, 4),
('Insurance',              '🛡️', 'fixed',  250, 5),
('Health Insurance (MCS)', '🏥', 'fixed',  633, 6),
('Cell Phone (Family)',    '📱', 'fixed',  400, 7),
('Solar Payment',          '☀️', 'fixed',  400, 8),
('Tools / Software',       '🔧', 'fixed',  200, 9),
('Starlink',               '🛰️', 'fixed',   70, 10),
('AutoExpreso (Tolls)',    '🚦', 'fixed',   80, 11),
('Groceries',              '🛒', 'food',   500, 12),
('Costco (food)',          '🏪', 'food',   250, 13),
('Restaurants',            '🍽️', 'food',   300, 14),
('Fast Food',              '🍔', 'food',   150, 15),
('Coffee / Bakeries',      '☕', 'food',    75, 16),
('Food Delivery',          '📦', 'food',    50, 17);

-- Disable RLS (personal app -- enable and add policies if you want auth later)
ALTER TABLE categories     DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE cc_snapshots   DISABLE ROW LEVEL SECURITY;
