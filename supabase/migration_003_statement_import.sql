-- Migration 003: statement import
-- Run this in your Supabase SQL Editor after migration 002.

-- ---------------------------------------------------------------------------
-- Transactions: track where a row came from, and fingerprint it for dedupe
-- ---------------------------------------------------------------------------

-- Which card a charge landed on. Lets an import update the right card and lets
-- you tell a Capital One charge from a Citi one after the fact.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_key TEXT;

-- 'manual' for anything typed into the app, 'import' for statement rows.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Stable hash of card + date + amount + normalised description. Re-importing a
-- statement you already processed inserts nothing instead of double-counting.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- Partial unique index: imported rows must be unique, manual rows are exempt
-- (you may legitimately buy the same coffee twice on the same day).
DROP INDEX IF EXISTS idx_transactions_fingerprint;
CREATE UNIQUE INDEX idx_transactions_fingerprint
  ON transactions (fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_card_key ON transactions (card_key);


-- ---------------------------------------------------------------------------
-- Merchant rules: how a statement description maps to a budget category
-- ---------------------------------------------------------------------------
-- Every time you correct a guess in the import preview, the correction is saved
-- here and applied automatically next month.

CREATE TABLE IF NOT EXISTS merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lowercased substring matched against the normalised description.
  pattern TEXT UNIQUE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  -- How many times this rule has been confirmed. Longer, more-used patterns win.
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_pattern ON merchant_rules (pattern);

ALTER TABLE merchant_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON merchant_rules;
CREATE POLICY "authenticated_all" ON merchant_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- Import log: what was uploaded, when, and what it did
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS statement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  statement_end DATE,
  closing_balance DECIMAL(10,2),
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE statement_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON statement_imports;
CREATE POLICY "authenticated_all" ON statement_imports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- Seed merchant rules for the categories in the default schema
-- ---------------------------------------------------------------------------
-- Safe to re-run: ON CONFLICT DO NOTHING leaves your own corrections alone.

INSERT INTO merchant_rules (pattern, category_id, hit_count)
SELECT v.pattern, c.id, 0
FROM (VALUES
  ('costco',        'Costco (food)'),
  ('walmart',       'Groceries'),
  ('sams club',     'Groceries'),
  ('econo',         'Groceries'),
  ('pueblo',        'Groceries'),
  ('supermercado',  'Groceries'),
  ('amazon fresh',  'Groceries'),
  ('whole foods',   'Groceries'),
  ('starbucks',     'Coffee / Bakeries'),
  ('panera',        'Coffee / Bakeries'),
  ('dunkin',        'Coffee / Bakeries'),
  ('cafe',          'Coffee / Bakeries'),
  ('panaderia',     'Coffee / Bakeries'),
  ('mcdonald',      'Fast Food'),
  ('burger king',   'Fast Food'),
  ('wendy',         'Fast Food'),
  ('taco bell',     'Fast Food'),
  ('kfc',           'Fast Food'),
  ('subway',        'Fast Food'),
  ('popeyes',       'Fast Food'),
  ('chick-fil-a',   'Fast Food'),
  ('doordash',      'Food Delivery'),
  ('uber eats',     'Food Delivery'),
  ('ubereats',      'Food Delivery'),
  ('grubhub',       'Food Delivery'),
  ('instacart',     'Food Delivery'),
  ('restaurant',    'Restaurants'),
  ('grill',         'Restaurants'),
  ('pizzeria',      'Restaurants'),
  ('cantina',       'Restaurants'),
  ('autoexpreso',   'AutoExpreso (Tolls)'),
  ('starlink',      'Starlink'),
  ('spacex',        'Starlink'),
  ('prepa',         'PREPA (Electric)'),
  ('aaa',           'Water / Utilities'),
  ('acueducto',     'Water / Utilities'),
  ('mcs',           'Health Insurance (MCS)'),
  ('t-mobile',      'Cell Phone (Family)'),
  ('tmobile',       'Cell Phone (Family)'),
  ('at&t',          'Cell Phone (Family)'),
  ('claro',         'Cell Phone (Family)'),
  ('liberty',       'Cell Phone (Family)'),
  ('github',        'Tools / Software'),
  ('openai',        'Tools / Software'),
  ('anthropic',     'Tools / Software'),
  ('adobe',         'Tools / Software'),
  ('microsoft',     'Tools / Software'),
  ('google',        'Tools / Software'),
  ('vercel',        'Tools / Software'),
  ('supabase',      'Tools / Software'),
  ('notion',        'Tools / Software'),
  ('figma',         'Tools / Software')
) AS v(pattern, cat_name)
JOIN categories c ON c.name = v.cat_name
ON CONFLICT (pattern) DO NOTHING;
