-- Bank reconciliation, and somewhere to put an overpayment.
-- Apply after 0012_payroll_posting.sql.
--
-- 0008 shipped `bank_transactions`, built around importing a CSV statement and
-- matching rows against the ledger. Nothing ever used it, and for a business
-- this size it is the wrong shape: it makes you produce a machine-readable
-- statement before you can reconcile at all, and then asks you to referee a
-- fuzzy match.
--
-- The way a small business actually reconciles is to sit with the statement and
-- tick off what has cleared, then check that the statement balance and the book
-- balance agree once uncleared items are allowed for. That needs two things:
-- a cleared marker on the bank side of each posting, and a record of each
-- month's proof. `bank_transactions` is left in place — a CSV import can still
-- feed suggestions later — but it is no longer on the critical path.

-- ---------------------------------------------------------------------------
-- Clearing state, on the journal line that actually hits the bank
-- ---------------------------------------------------------------------------

create table if not exists bank_reconciliations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  bank_account_id text not null references ledger_accounts(id) on delete cascade,
  -- The date the statement was drawn to, not the date this was done.
  statement_date date not null,
  -- What the bank says. Typed in from the statement.
  statement_balance numeric(14,2) not null,
  -- What the ledger says at that date, captured when the period was locked so
  -- a later backdated posting cannot silently rewrite a signed-off month.
  book_balance numeric(14,2) not null,
  -- Cleared book balance less statement balance. Zero is a clean reconciliation.
  difference numeric(14,2) not null default 0,
  status text not null default 'Open' check (status in ('Open', 'Locked')),
  notes text not null default '',
  locked_at timestamptz,
  locked_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One reconciliation per account per statement date.
  unique (bank_account_id, statement_date)
);

create index if not exists bank_reconciliations_account_idx
  on bank_reconciliations(bank_account_id, statement_date desc);

-- Cleared is a property of the posting, not of a separate matching record: the
-- question "has this payment shown up on the statement yet" belongs to the line
-- that moved the bank balance.
alter table journal_lines
  add column if not exists cleared_at timestamptz;
alter table journal_lines
  add column if not exists reconciliation_id text
  references bank_reconciliations(id) on delete set null;

create index if not exists journal_lines_cleared_idx
  on journal_lines(account_id, cleared_at);

-- A locked reconciliation is evidence. Un-clearing a line inside one would
-- change a figure someone has signed off, so the database refuses it and the
-- operator has to unlock deliberately.
create or replace function assert_reconciliation_open() returns trigger as $$
declare
  locked_status text;
begin
  if old.reconciliation_id is null then
    return new;
  end if;
  if new.reconciliation_id is not distinct from old.reconciliation_id
     and new.cleared_at is not distinct from old.cleared_at then
    return new;
  end if;

  select status into locked_status
    from bank_reconciliations where id = old.reconciliation_id;

  if locked_status = 'Locked' then
    raise exception 'That reconciliation is locked. Unlock it before changing what has cleared.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists journal_lines_reconciliation_open on journal_lines;
create trigger journal_lines_reconciliation_open
  before update on journal_lines
  for each row execute function assert_reconciliation_open();

-- ---------------------------------------------------------------------------
-- Overpayments
-- ---------------------------------------------------------------------------
--
-- Money received beyond what an invoice asks for is not income and is not a
-- reduction of receivables — it is owed back or owed as future service, so it
-- belongs on the liability side until it is applied or refunded. Leaving it in
-- receivables makes a client look like they owe a negative amount, which is
-- how an aged debtors list starts lying.
--
-- Note this is *not* modelled as paying more than an invoice's value:
-- validate_payment_allocation() refuses an allocation larger than the document,
-- and rightly so. An overpayment is an unallocated payment, which
-- payments.unallocated already records.

insert into ledger_accounts (organization_id, code, name, type, subtype, system_key, description)
values
  ('org-kretivco', '2400', 'Customer advances', 'liability', 'Receivables', 'customer_advances',
   'Money received from clients that is not yet applied to an invoice.'),
  ('org-kretivco', '1400', 'Supplier advances', 'asset', 'Payables', 'supplier_advances',
   'Money paid to suppliers ahead of a bill.')
on conflict (organization_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------
--
-- Returning an unapplied overpayment is a real cash movement and needs to reach
-- the ledger like any other. It is recorded as a payment in the opposite
-- direction, tagged so it is not mistaken for a purchase or a sale.

alter table payments
  add column if not exists is_refund boolean not null default false;

create index if not exists payments_refund_idx
  on payments(organization_id, is_refund) where is_refund;
