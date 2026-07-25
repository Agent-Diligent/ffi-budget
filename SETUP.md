# FFI Budget -- setup and deployment notes

## Run the migrations, in this order

The app was previously readable and writable by anyone who had the URL. These
migrations close that and add the statement import. Run them in the Supabase SQL
Editor, top to bottom.

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/schema.sql` | Base tables (already applied on an existing install) |
| 2 | `supabase/migration_cc_cards.sql` | `cc_cards` table (already applied) |
| 3 | `supabase/migration_002_security_and_promo.sql` | **RLS lockdown**, snapshot dedupe, promo columns |
| 4 | `supabase/migration_003_statement_import.sql` | Import fingerprints, merchant rules, import log |

### Before running 002: create your user

Migration 002 restricts every table to signed-in sessions. Create your login
**first**, or you will lock yourself out of your own data.

1. Supabase Dashboard, Authentication, Users, Add user, Create new user.
2. Enter your email and a password, and tick **Auto Confirm User**.
3. Authentication, Providers, Email, turn **off** "Enable sign ups" so nobody
   else can register against your project.
4. Now run migration 002, then sign in at `/login`.

### After running 002: set your real post-promo APRs

The migration backfills both promo cards with a placeholder `24.99%`. The payoff
projection uses this to model what happens when a 0% promo lapses with a balance
still on it, so replace it with the actual go-to rate from each card agreement:

```sql
UPDATE cc_cards SET post_promo_apr = 27.24 WHERE key = 'oldpromo';
UPDATE cc_cards SET post_promo_apr = 25.99 WHERE key = 'newpromo';
```

Step 4 of migration 002 drops the old free-text `deadline` column. It is
commented out. Run it only once you have confirmed the promo dates look right.

## Importing a statement

1. Download the **CSV** export from your card issuer. Every major issuer offers
   this on the statements page. PDF is not supported: statement PDFs are print
   layouts that differ per issuer and per template revision, and a parser that
   silently misreads a row is worse than no parser.
2. Go to **Import**, pick the card, choose the file.
3. The parser reports what it detected (issuer, which columns, and whether
   charges appear as positive or negative). Check that strip before continuing.
4. Review the rows. Categories are guessed from merchant rules. Anything it
   could not match is highlighted. Correct any guess and that correction is
   saved as a rule, so next month it is automatic.
5. Enter the statement closing balance and import. Charges become transactions,
   the card balance updates, and a snapshot is logged for the History charts.

Re-importing the same statement is safe. Each charge carries a fingerprint of
card, date, amount, and normalised description, so already-imported rows are
detected and skipped, and a database uniqueness constraint blocks any that slip
through.

Payments to the card are detected and excluded by default: they are not
spending, and counting them would double-dip against your budget.

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run test       # vitest -- payoff math, CSV parsing, categorisation
```

The payoff calculator and statement parser carry the financial logic, so both
have test coverage. Run `npm run test` before deploying a change to either.

## Deployment

Environment variables required (see `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

The anon key is public by design and ships in the browser bundle. It is not a
secret and it is not what protects your data: the RLS policies from migration
002 are. Do not add a service-role key to this app.
