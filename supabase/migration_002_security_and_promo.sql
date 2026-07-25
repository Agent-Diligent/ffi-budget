-- Migration 002: lock down access, fix snapshot duplicates, model promo expiry
-- Run this in your Supabase SQL Editor, top to bottom.
--
-- IMPORTANT: run STEP 0 first and confirm you can sign in before running STEP 1,
-- otherwise you will lock yourself out of your own data.

-- ---------------------------------------------------------------------------
-- STEP 0 -- create your user
-- ---------------------------------------------------------------------------
-- Do this in the Supabase Dashboard, not here:
--   Authentication -> Users -> Add user -> Create new user
--   Enter your email + a password, and tick "Auto Confirm User".
-- Then sign in at /login in the app to confirm it works.
--
-- Also turn OFF public signups so nobody else can create an account:
--   Authentication -> Providers -> Email -> disable "Enable sign ups"


-- ---------------------------------------------------------------------------
-- STEP 1 -- enable RLS and restrict every table to signed-in users
-- ---------------------------------------------------------------------------
-- Until now: RLS was disabled on 4 tables and cc_cards allowed anon full access.
-- The anon key ships in the browser bundle, so anyone with the deployed URL
-- could read, edit, and delete all of this data.

-- Remove the wide-open anon policy from the previous migration.
DROP POLICY IF EXISTS "anon_all" ON cc_cards;

ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_cards       ENABLE ROW LEVEL SECURITY;

-- Single-user app: any authenticated session gets full access, anon gets none.
-- If this ever becomes multi-user, add a user_id column and scope on auth.uid().
DROP POLICY IF EXISTS "authenticated_all" ON categories;
CREATE POLICY "authenticated_all" ON categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON transactions;
CREATE POLICY "authenticated_all" ON transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON income_entries;
CREATE POLICY "authenticated_all" ON income_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON cc_snapshots;
CREATE POLICY "authenticated_all" ON cc_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON cc_cards;
CREATE POLICY "authenticated_all" ON cc_cards
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------------
-- STEP 2 -- stop duplicate balance snapshots
-- ---------------------------------------------------------------------------
-- Saving balances twice in one day inserted two rows for the same card+date,
-- and the "one snapshot per month" pick then depended on row order.

-- Collapse any existing duplicates, keeping the most recently written row.
DELETE FROM cc_snapshots a
USING cc_snapshots b
WHERE a.card_key = b.card_key
  AND a.date     = b.date
  AND a.created_at < b.created_at;

ALTER TABLE cc_snapshots
  DROP CONSTRAINT IF EXISTS cc_snapshots_card_date_unique;
ALTER TABLE cc_snapshots
  ADD CONSTRAINT cc_snapshots_card_date_unique UNIQUE (card_key, date);


-- ---------------------------------------------------------------------------
-- STEP 3 -- model promo expiry properly
-- ---------------------------------------------------------------------------
-- `deadline` was free text ("Dec 16, 2026"), never used in the payoff math, and
-- matched with string comparisons in the UI. These give the calculator real data.

ALTER TABLE cc_cards ADD COLUMN IF NOT EXISTS promo_end      DATE;
ALTER TABLE cc_cards ADD COLUMN IF NOT EXISTS post_promo_apr DECIMAL(5,2);

-- Backfill the two seeded promo cards. Adjust the post-promo APRs to the real
-- go-to rates on your card agreements before trusting the projection.
UPDATE cc_cards SET promo_end = DATE '2026-12-16', post_promo_apr = 24.99
  WHERE key = 'oldpromo' AND promo_end IS NULL;
UPDATE cc_cards SET promo_end = DATE '2027-08-01', post_promo_apr = 24.99
  WHERE key = 'newpromo' AND promo_end IS NULL;

COMMENT ON COLUMN cc_cards.promo_end IS
  'Date the 0% promotional rate ends. NULL means no promo.';
COMMENT ON COLUMN cc_cards.post_promo_apr IS
  'APR that applies once promo_end passes. NULL falls back to the card APR.';


-- ---------------------------------------------------------------------------
-- STEP 4 -- OPTIONAL, run only after you have verified the app works
-- ---------------------------------------------------------------------------
-- The old free-text `deadline` column is no longer read by any code. Drop it
-- once you are happy the promo dates above are correct. This is destructive.
--
--   ALTER TABLE cc_cards DROP COLUMN deadline;
