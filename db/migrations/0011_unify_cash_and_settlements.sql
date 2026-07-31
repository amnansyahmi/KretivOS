-- Bring cash transactions and settlements onto the ledger.
-- Apply after 0010_invoice_posting.sql.
--
-- The Finance tab and the Accounting workspace covered the same ground with two
-- incompatible models. Finance wrote `finance_transactions` — a flat cash log
-- with a free-text category, no bank account and no counterparty. Accounting
-- wrote a double-entry journal. Both recorded the same money:
--
--   - marking an invoice paid posted to the journal AND inserted a cash row
--   - marking a settlement paid inserted a cash row and nothing else
--   - the `ensure_income_transaction` automation inserted a third
--
-- So "how much did we earn" had two answers that could never agree, depending on
-- which screen you opened. This links both record types to the journal so the
-- ledger is the single source of truth, and leaves `finance_transactions` in
-- place as a readable history rather than a competing one.

-- Links a cash-log row to the entry that supersedes it. Rows that have one are
-- history; rows that do not are pre-ledger records still worth reading.
alter table finance_transactions
  add column if not exists journal_entry_id text references journal_entries(id) on delete set null;

create index if not exists finance_transactions_journal_idx
  on finance_transactions(journal_entry_id) where journal_entry_id is not null;

-- The bank or cash account the money actually moved through. The Finance tab
-- never asked, which is why the cash log could never reconcile to a statement.
alter table finance_transactions
  add column if not exists bank_account_id text references ledger_accounts(id) on delete set null;

-- The income or expense account the amount belongs to, replacing the free-text
-- `category` that made every historical row unclassifiable.
alter table finance_transactions
  add column if not exists ledger_account_id text references ledger_accounts(id) on delete set null;

alter table settlements
  add column if not exists journal_entry_id text references journal_entries(id) on delete set null;

create index if not exists settlements_journal_idx
  on settlements(journal_entry_id) where journal_entry_id is not null;

-- Which bank account received a settlement payment.
alter table settlements
  add column if not exists bank_account_id text references ledger_accounts(id) on delete set null;

-- Settlement income deserves its own account so it can be read separately from
-- retainers and production work on the profit and loss.
insert into ledger_accounts (organization_id, code, name, type, subtype, system_key, description)
values ('org-kretivco', '4030', 'Settlement income', 'income', 'Revenue', 'settlement_income',
        'Weekly per-unit settlement fees, incentives and advertising reimbursement.')
on conflict (organization_id, code) do nothing;

-- Owner drawings and capital introduced are movements against equity, not
-- income or expense. Without these, a cash withdrawal has nowhere honest to go.
insert into ledger_accounts (organization_id, code, name, type, subtype, system_key, description)
values
  ('org-kretivco', '3200', 'Owner drawings', 'equity', 'Drawings', 'owner_drawings',
   'Money taken out of the business by the owners.'),
  ('org-kretivco', '1250', 'Petty cash float', 'asset', 'Cash', null,
   'Cash held for small purchases, reconciled against receipts.')
on conflict (organization_id, code) do nothing;
