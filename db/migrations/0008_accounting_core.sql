-- Double-entry accounting core.
-- Apply after 0001_initial.sql through 0007_shared_planner_projection.sql.
--
-- `finance_transactions` is a single-entry cash log: one row, one amount, a
-- category string. It can answer "how much went out in July" and nothing else.
-- It cannot produce a balance sheet, cannot say what is owed to whom, and has no
-- concept of which bank account the money moved through.
--
-- This adds a real ledger underneath. The UI stays money-in / money-out; the
-- journal is there for the accountant and for anything that has to reconcile.
-- `finance_transactions` is left untouched and keeps working — accounting reads
-- from the journal, and lib/accounting.ts posts to both while the older Finance
-- tab is still in use.

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------

create table if not exists ledger_accounts (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  -- Numeric code so reports sort the way an accountant expects (1000s assets,
  -- 2000s liabilities, and so on).
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  subtype text not null default '',
  parent_id text references ledger_accounts(id) on delete set null,
  -- Bank and cash accounts are ordinary asset accounts that also carry a
  -- balance the operator reconciles against a statement.
  is_bank boolean not null default false,
  bank_name text not null default '',
  account_number text not null default '',
  currency text not null default 'MYR',
  -- Accounts the system posts to by name (see lib/accounting.ts). Protected
  -- from deletion because a missing one breaks posting.
  system_key text,
  is_active boolean not null default true,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, system_key)
);

create index if not exists ledger_accounts_type_idx on ledger_accounts(organization_id, type, code);

-- ---------------------------------------------------------------------------
-- Fiscal periods
-- ---------------------------------------------------------------------------

-- Closing a period stops anyone quietly editing a month that has already been
-- reported or filed. Posting checks this before writing.
create table if not exists fiscal_periods (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  closed_at timestamptz,
  closed_by text references users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, year, month)
);

-- ---------------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------------

create table if not exists journal_entries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  entry_date date not null,
  reference text not null default '',
  memo text not null default '',
  -- What produced this entry: 'bill', 'invoice', 'payment', 'capture',
  -- 'manual', 'settlement', 'payroll', 'claim'. Lets a posted entry be traced
  -- back to the record the operator actually sees.
  source_type text not null default 'manual',
  source_id text,
  status text not null default 'Posted' check (status in ('Draft', 'Posted', 'Void')),
  -- Voiding writes a reversing entry rather than deleting, so the audit trail
  -- survives. This points at the entry being reversed.
  reverses_entry_id text references journal_entries(id) on delete set null,
  currency text not null default 'MYR',
  exchange_rate numeric(18,8) not null default 1,
  created_by text references users(id) on delete set null,
  posted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_entries_date_idx on journal_entries(organization_id, entry_date);
create index if not exists journal_entries_source_idx on journal_entries(source_type, source_id);

create table if not exists journal_lines (
  id text primary key default gen_random_uuid()::text,
  entry_id text not null references journal_entries(id) on delete cascade,
  account_id text not null references ledger_accounts(id) on delete restrict,
  -- Exactly one side carries a value. Both-zero or both-positive is meaningless
  -- and the check below rejects it.
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  memo text not null default '',
  customer_id text references customers(id) on delete set null,
  vendor_id text,
  project_id text references projects(id) on delete set null,
  tax_code text not null default '',
  line_order integer not null default 0,
  constraint journal_lines_one_sided check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index if not exists journal_lines_entry_idx on journal_lines(entry_id);
create index if not exists journal_lines_account_idx on journal_lines(account_id);
create index if not exists journal_lines_customer_idx on journal_lines(customer_id);

-- The defining rule of double-entry: an entry's debits must equal its credits.
-- Enforced in the database as well as in lib/accounting.ts, because an
-- unbalanced entry silently corrupts every report derived from the journal and
-- application-level checks do not survive a direct SQL fix at 2am.
create or replace function assert_journal_balanced() returns trigger as $$
declare
  target_entry text;
  total_debit numeric(14,2);
  total_credit numeric(14,2);
  entry_status text;
begin
  target_entry := coalesce(new.entry_id, old.entry_id);

  select status into entry_status from journal_entries where id = target_entry;
  -- Drafts are allowed to be unbalanced while they are being built.
  if entry_status is distinct from 'Posted' then
    return null;
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into total_debit, total_credit
    from journal_lines where entry_id = target_entry;

  if total_debit <> total_credit then
    raise exception 'Journal entry % is unbalanced: debits %, credits %',
      target_entry, total_debit, total_credit;
  end if;
  return null;
end;
$$ language plpgsql;

-- Deferred to the end of the transaction so a multi-line entry can be inserted
-- one row at a time without tripping the check mid-way.
drop trigger if exists journal_lines_balanced on journal_lines;
create constraint trigger journal_lines_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function assert_journal_balanced();

-- Posting into a closed period is refused outright.
create or replace function assert_period_open() returns trigger as $$
declare
  period_status text;
begin
  if new.status <> 'Posted' then
    return new;
  end if;

  select status into period_status
    from fiscal_periods
    where organization_id = new.organization_id
      and year = extract(year from new.entry_date)::int
      and month = extract(month from new.entry_date)::int;

  if period_status = 'Closed' then
    raise exception 'Accounting period %-% is closed.',
      extract(year from new.entry_date)::int, extract(month from new.entry_date)::int;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists journal_entries_period_open on journal_entries;
create trigger journal_entries_period_open
  before insert or update on journal_entries
  for each row execute function assert_period_open();

-- ---------------------------------------------------------------------------
-- Vendors (money out had no counterparty record at all)
-- ---------------------------------------------------------------------------

create table if not exists vendors (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  registration_number text not null default '',
  -- Tax identifiers, needed for e-Invoice self-billed documents.
  tin text not null default '',
  sst_number text not null default '',
  email text not null default '',
  phone text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  state text not null default '',
  postcode text not null default '',
  country_code text not null default 'MYS',
  payment_terms_days integer not null default 30,
  default_expense_account_id text references ledger_accounts(id) on delete set null,
  currency text not null default 'MYR',
  bank_account_name text not null default '',
  bank_account_number text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_organization_idx on vendors(organization_id, status, name);

-- ---------------------------------------------------------------------------
-- Bills (accounts payable)
-- ---------------------------------------------------------------------------

create table if not exists bills (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  vendor_id text not null references vendors(id) on delete restrict,
  bill_number text not null default '',
  reference text not null default '',
  bill_date date not null,
  due_date date,
  currency text not null default 'MYR',
  exchange_rate numeric(18,8) not null default 1,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  -- Maintained by allocation writes so aging does not need to re-aggregate.
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'Draft'
    check (status in ('Draft', 'Awaiting approval', 'Approved', 'Partially paid', 'Paid', 'Void')),
  customer_id text references customers(id) on delete set null,
  project_id text references projects(id) on delete set null,
  journal_entry_id text references journal_entries(id) on delete set null,
  capture_id text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bills_vendor_idx on bills(vendor_id);
create index if not exists bills_due_idx on bills(organization_id, status, due_date);
-- A vendor's own invoice number identifies the bill; this is what stops the
-- same PDF being entered twice by two people.
create unique index if not exists bills_vendor_number_idx
  on bills(vendor_id, lower(bill_number)) where bill_number <> '';

create table if not exists bill_lines (
  id text primary key default gen_random_uuid()::text,
  bill_id text not null references bills(id) on delete cascade,
  account_id text references ledger_accounts(id) on delete set null,
  description text not null default '',
  quantity numeric(14,4) not null default 1,
  unit_price numeric(14,4) not null default 0,
  tax_code text not null default '',
  tax_rate numeric(6,3) not null default 0,
  amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  customer_id text references customers(id) on delete set null,
  project_id text references projects(id) on delete set null,
  line_order integer not null default 0
);

create index if not exists bill_lines_bill_idx on bill_lines(bill_id);

-- ---------------------------------------------------------------------------
-- Payments — one table serves both directions
-- ---------------------------------------------------------------------------

create table if not exists payments (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  payment_date date not null,
  -- The bank or cash account the money actually moved through.
  bank_account_id text not null references ledger_accounts(id) on delete restrict,
  customer_id text references customers(id) on delete set null,
  vendor_id text references vendors(id) on delete set null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'MYR',
  exchange_rate numeric(18,8) not null default 1,
  method text not null default 'Bank transfer',
  reference text not null default '',
  -- Money received that has not been matched to an invoice yet, or money paid
  -- ahead of a bill. Drives the "unallocated" figure on the aging reports.
  unallocated numeric(14,2) not null default 0,
  journal_entry_id text references journal_entries(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_date_idx on payments(organization_id, payment_date);
create index if not exists payments_vendor_idx on payments(vendor_id);
create index if not exists payments_customer_idx on payments(customer_id);

-- A payment can settle several documents and a document can be settled by
-- several payments, so allocation is its own table rather than a column.
create table if not exists payment_allocations (
  id text primary key default gen_random_uuid()::text,
  payment_id text not null references payments(id) on delete cascade,
  bill_id text references bills(id) on delete cascade,
  sales_document_id text references sales_documents(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint payment_allocations_one_target check (
    (bill_id is not null and sales_document_id is null)
    or (bill_id is null and sales_document_id is not null)
  )
);

create index if not exists payment_allocations_payment_idx on payment_allocations(payment_id);
create index if not exists payment_allocations_bill_idx on payment_allocations(bill_id);
create index if not exists payment_allocations_sales_idx on payment_allocations(sales_document_id);

-- ---------------------------------------------------------------------------
-- Bank statement import and reconciliation
-- ---------------------------------------------------------------------------

create table if not exists bank_transactions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  bank_account_id text not null references ledger_accounts(id) on delete cascade,
  transaction_date date not null,
  description text not null default '',
  reference text not null default '',
  -- Signed: positive is money in, negative is money out, as the statement reads.
  amount numeric(14,2) not null,
  balance numeric(14,2),
  status text not null default 'Unmatched' check (status in ('Unmatched', 'Matched', 'Ignored')),
  matched_entry_id text references journal_entries(id) on delete set null,
  matched_payment_id text references payments(id) on delete set null,
  -- Hash of the statement row, so re-importing an overlapping CSV does not
  -- duplicate transactions.
  import_fingerprint text not null,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (bank_account_id, import_fingerprint)
);

create index if not exists bank_transactions_account_idx
  on bank_transactions(bank_account_id, transaction_date);

-- ---------------------------------------------------------------------------
-- Seed: chart of accounts for a Malaysian small business
-- ---------------------------------------------------------------------------

insert into ledger_accounts (organization_id, code, name, type, subtype, is_bank, system_key, description)
values
  ('org-kretivco', '1000', 'Cash on hand',              'asset',     'Cash',              true,  'cash',              'Physical cash float.'),
  ('org-kretivco', '1010', 'Business bank account',     'asset',     'Bank',              true,  'bank',              'Primary operating account.'),
  ('org-kretivco', '1100', 'Accounts receivable',       'asset',     'Receivable',        false, 'accounts_receivable', 'Invoiced to clients, not yet collected.'),
  ('org-kretivco', '1200', 'Prepayments',               'asset',     'Current asset',     false, null,                'Costs paid ahead of the period they belong to.'),
  ('org-kretivco', '1300', 'SST input tax',             'asset',     'Tax',               false, 'tax_input',         'Recoverable service tax on purchases.'),
  ('org-kretivco', '1500', 'Equipment',                 'asset',     'Fixed asset',       false, null,                'Cameras, computers and production equipment.'),
  ('org-kretivco', '2000', 'Accounts payable',          'liability', 'Payable',           false, 'accounts_payable',  'Billed by suppliers, not yet paid.'),
  ('org-kretivco', '2100', 'SST output tax',            'liability', 'Tax',               false, 'tax_output',        'Service tax charged to clients and owed to the government.'),
  ('org-kretivco', '2200', 'Accrued expenses',          'liability', 'Current liability', false, null,                'Costs incurred but not yet billed.'),
  ('org-kretivco', '2300', 'Payroll liabilities',       'liability', 'Payroll',           false, 'payroll_liability', 'EPF, SOCSO, EIS and PCB owed but not yet remitted.'),
  ('org-kretivco', '3000', 'Owner capital',             'equity',    'Capital',           false, null,                'Capital introduced by the owners.'),
  ('org-kretivco', '3100', 'Retained earnings',         'equity',    'Retained',          false, 'retained_earnings', 'Accumulated profit from prior periods.'),
  ('org-kretivco', '4000', 'Management fee income',     'income',    'Revenue',           false, 'sales_income',      'Retainer and management fees.'),
  ('org-kretivco', '4010', 'Performance incentive',     'income',    'Revenue',           false, null,                'Incentive earned on client sales performance.'),
  ('org-kretivco', '4020', 'Production income',         'income',    'Revenue',           false, null,                'Creative production and campaign delivery.'),
  ('org-kretivco', '4900', 'Other income',              'income',    'Other',             false, null,                'Anything outside normal trading.'),
  ('org-kretivco', '5000', 'Subcontractor costs',       'expense',   'Cost of sales',     false, null,                'Freelancers and production partners.'),
  ('org-kretivco', '5010', 'Advertising spend',         'expense',   'Cost of sales',     false, 'advertising',       'Meta, Google, TikTok and marketplace advertising.'),
  ('org-kretivco', '6000', 'Salaries and wages',        'expense',   'Operating',         false, 'salaries',          'Team salaries.'),
  ('org-kretivco', '6010', 'EPF, SOCSO and EIS',        'expense',   'Operating',         false, null,                'Employer statutory contributions.'),
  ('org-kretivco', '6100', 'Rent',                      'expense',   'Operating',         false, null,                'Office and studio rent.'),
  ('org-kretivco', '6110', 'Utilities and internet',    'expense',   'Operating',         false, null,                'Electricity, water and connectivity.'),
  ('org-kretivco', '6200', 'Software subscriptions',    'expense',   'Operating',         false, 'software',          'SaaS tools and cloud services.'),
  ('org-kretivco', '6300', 'Travel and transport',      'expense',   'Operating',         false, 'travel',            'Client travel, mileage and parking.'),
  ('org-kretivco', '6310', 'Meals and entertainment',   'expense',   'Operating',         false, 'meals',             'Client meals and team refreshments.'),
  ('org-kretivco', '6400', 'Professional fees',         'expense',   'Operating',         false, null,                'Accounting, legal and advisory.'),
  ('org-kretivco', '6500', 'Bank charges',              'expense',   'Operating',         false, 'bank_charges',      'Transaction and gateway fees.'),
  ('org-kretivco', '6900', 'Other expenses',            'expense',   'Operating',         false, 'uncategorised',     'Holding account for costs awaiting classification.')
on conflict (organization_id, code) do nothing;

-- Open the current and next twelve months so posting works immediately.
insert into fiscal_periods (organization_id, year, month)
select
  'org-kretivco',
  extract(year from month_start)::int,
  extract(month from month_start)::int
from generate_series(
  date_trunc('month', current_date) - interval '12 months',
  date_trunc('month', current_date) + interval '12 months',
  interval '1 month'
) as month_start
on conflict (organization_id, year, month) do nothing;

drop trigger if exists ledger_accounts_set_updated_at on ledger_accounts;
create trigger ledger_accounts_set_updated_at before update on ledger_accounts
for each row execute function set_updated_at();

drop trigger if exists journal_entries_set_updated_at on journal_entries;
create trigger journal_entries_set_updated_at before update on journal_entries
for each row execute function set_updated_at();

drop trigger if exists vendors_set_updated_at on vendors;
create trigger vendors_set_updated_at before update on vendors
for each row execute function set_updated_at();

drop trigger if exists bills_set_updated_at on bills;
create trigger bills_set_updated_at before update on bills
for each row execute function set_updated_at();

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at before update on payments
for each row execute function set_updated_at();

drop trigger if exists fiscal_periods_set_updated_at on fiscal_periods;
create trigger fiscal_periods_set_updated_at before update on fiscal_periods
for each row execute function set_updated_at();
