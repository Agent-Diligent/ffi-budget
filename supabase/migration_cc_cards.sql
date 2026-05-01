-- Migration: dynamic cc_cards table
-- Run this in Supabase SQL Editor

CREATE TABLE cc_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bank TEXT DEFAULT '',
  apr DECIMAL(5,2) NOT NULL DEFAULT 0,
  start_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_payment DECIMAL(10,2) NOT NULL DEFAULT 25,
  color TEXT DEFAULT '#58a6ff',
  note TEXT DEFAULT '',
  deadline TEXT DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed your existing 4 cards
INSERT INTO cc_cards (key, name, bank, apr, start_balance, balance, min_payment, color, note, deadline, sort_order) VALUES
('capone',   'Capital One Venture',  'Capital One · 1202', 24.40, 10963, 4763,  308, '#f85149', 'Highest APR -- kill first',       NULL,           1),
('citi',     'Costco Anywhere Visa', 'Citi · 5268',        22.74,  3481, 3481,   41, '#d29922', 'APR rising Jun 20 -- stop using', NULL,           2),
('newpromo', '0% Promo (New BT)',    'New Card',            0.00,  5000, 5000,   50, '#3fb950', '0% promo -- expires ~Aug 2027',   'Aug 2027',     3),
('oldpromo', '0% Promo (15K Card)', 'Promo Card',           0.00, 15418, 15418,  175, '#58a6ff', '$10,218 expires Dec 16, 2026!',  'Dec 16, 2026', 4);

ALTER TABLE cc_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON cc_cards FOR ALL TO anon USING (true) WITH CHECK (true);
