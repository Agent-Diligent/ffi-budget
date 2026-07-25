-- Migration 004: variable spending categories
-- Run after 003. Safe to re-run.
--
-- The schema always allowed three category types, but only `fixed` and `food`
-- were ever implemented in the UI, so real card spending (gas, shopping,
-- pharmacy, travel) had nowhere to go. This seeds the `variable` type.
--
-- monthly_target is 0 for all of these, meaning "no budget set". The UI shows
-- them as untargeted rather than as overspent. Set a target on any you want to
-- actually budget against, for example:
--   UPDATE categories SET monthly_target = 400 WHERE name = 'Gas / Fuel';

INSERT INTO categories (name, icon, type, monthly_target, sort_order) VALUES
  ('Gas / Fuel',              '⛽', 'variable', 0, 20),
  ('Shopping / Merchandise',  '🛍️', 'variable', 0, 21),
  ('Pharmacy / Health',       '💊', 'variable', 0, 22),
  ('Auto Maintenance',        '🚙', 'variable', 0, 23),
  ('Home / Hardware',         '🏡', 'variable', 0, 24),
  ('Entertainment',           '🎬', 'variable', 0, 25),
  ('Travel / Hotels',         '✈️', 'variable', 0, 26),
  ('Clothing',                '👕', 'variable', 0, 27),
  ('Personal Care',           '💇', 'variable', 0, 28),
  ('Gifts',                   '🎁', 'variable', 0, 29),
  ('Kids / School',           '🎒', 'variable', 0, 30),
  ('Pets',                    '🐾', 'variable', 0, 31),
  ('Subscriptions / Streaming','📺', 'variable', 0, 32),
  ('Interest / Finance Charges','💸','variable', 0, 33),
  ('Fees',                    '🏦', 'variable', 0, 34)
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- Merchant rules for the new categories
-- ---------------------------------------------------------------------------
-- Longer patterns win over shorter ones, so 'costco gas' correctly beats the
-- existing 'costco' rule that points at Costco (food), and 'uber eats' keeps
-- beating 'uber'. hit_count 0 marks these as unconfirmed seeds, so the import
-- review flags them for a look rather than trusting them silently.

INSERT INTO merchant_rules (pattern, category_id, hit_count)
SELECT v.pattern, c.id, 0
FROM (VALUES
  -- Gas
  ('costco gas',    'Gas / Fuel'),
  ('shell',         'Gas / Fuel'),
  ('chevron',       'Gas / Fuel'),
  ('texaco',        'Gas / Fuel'),
  ('exxon',         'Gas / Fuel'),
  ('mobil',         'Gas / Fuel'),
  ('puma',          'Gas / Fuel'),
  ('gasolina',      'Gas / Fuel'),
  ('total pr',      'Gas / Fuel'),
  -- Shopping
  ('amazon',        'Shopping / Merchandise'),
  ('ebay',          'Shopping / Merchandise'),
  ('ross stores',   'Shopping / Merchandise'),
  ('marshalls',     'Shopping / Merchandise'),
  ('tj maxx',       'Shopping / Merchandise'),
  ('best buy',      'Shopping / Merchandise'),
  ('office depot',  'Shopping / Merchandise'),
  -- Pharmacy
  ('walgreens',     'Pharmacy / Health'),
  ('cvs',           'Pharmacy / Health'),
  ('farmacia',      'Pharmacy / Health'),
  ('rite aid',      'Pharmacy / Health'),
  ('dentist',       'Pharmacy / Health'),
  ('laboratorio',   'Pharmacy / Health'),
  -- Auto
  ('autozone',      'Auto Maintenance'),
  ('o reilly',      'Auto Maintenance'),
  ('napa auto',     'Auto Maintenance'),
  ('jiffy lube',    'Auto Maintenance'),
  ('goodyear',      'Auto Maintenance'),
  ('firestone',     'Auto Maintenance'),
  ('pep boys',      'Auto Maintenance'),
  ('taller',        'Auto Maintenance'),
  -- Home
  ('home depot',    'Home / Hardware'),
  ('lowes',         'Home / Hardware'),
  ('ace hardware',  'Home / Hardware'),
  ('ferreteria',    'Home / Hardware'),
  ('ikea',          'Home / Hardware'),
  -- Entertainment
  ('cinema',        'Entertainment'),
  ('caribbean cine','Entertainment'),
  ('amc ',          'Entertainment'),
  ('ticketmaster',  'Entertainment'),
  ('steam games',   'Entertainment'),
  ('playstation',   'Entertainment'),
  ('xbox',          'Entertainment'),
  -- Travel
  ('airbnb',        'Travel / Hotels'),
  ('hotel',         'Travel / Hotels'),
  ('marriott',      'Travel / Hotels'),
  ('hilton',        'Travel / Hotels'),
  ('jetblue',       'Travel / Hotels'),
  ('delta air',     'Travel / Hotels'),
  ('united air',    'Travel / Hotels'),
  ('american air',  'Travel / Hotels'),
  ('expedia',       'Travel / Hotels'),
  ('booking com',   'Travel / Hotels'),
  ('avis',          'Travel / Hotels'),
  ('enterprise rent','Travel / Hotels'),
  -- Clothing
  ('nike',          'Clothing'),
  ('adidas',        'Clothing'),
  ('zara',          'Clothing'),
  ('old navy',      'Clothing'),
  ('foot locker',   'Clothing'),
  ('burlington',    'Clothing'),
  -- Personal care
  ('barber',        'Personal Care'),
  ('salon',         'Personal Care'),
  ('ulta',          'Personal Care'),
  ('sephora',       'Personal Care'),
  ('sally beauty',  'Personal Care'),
  -- Kids
  ('colegio',       'Kids / School'),
  ('school',        'Kids / School'),
  ('uniforme',      'Kids / School'),
  -- Pets
  ('petco',         'Pets'),
  ('petsmart',      'Pets'),
  ('veterinar',     'Pets'),
  -- Subscriptions
  ('netflix',       'Subscriptions / Streaming'),
  ('spotify',       'Subscriptions / Streaming'),
  ('hulu',          'Subscriptions / Streaming'),
  ('disney plus',   'Subscriptions / Streaming'),
  ('hbo',           'Subscriptions / Streaming'),
  ('youtube',       'Subscriptions / Streaming'),
  ('apple com bill','Subscriptions / Streaming'),
  ('prime video',   'Subscriptions / Streaming'),
  -- Card costs
  ('interest charge','Interest / Finance Charges'),
  ('finance charge','Interest / Finance Charges'),
  ('purchase interest','Interest / Finance Charges'),
  ('annual membership fee','Fees'),
  ('late fee',      'Fees'),
  ('foreign transaction','Fees'),
  ('cash advance fee','Fees'),
  ('over limit',    'Fees')
) AS v(pattern, cat_name)
JOIN categories c ON c.name = v.cat_name
ON CONFLICT (pattern) DO NOTHING;
