-- Post customer invoices to the ledger.
-- Apply after 0009_capture_and_einvoice.sql.
--
-- The ledger shipped with only half of the money flow wired. Bills debited an
-- expense and credited payables; nothing ever debited receivables or credited
-- income. Raising an invoice produced no journal entry at all, which meant:
--
--   - the profit and loss reported zero income, so every period showed a loss
--   - receivables accumulated a negative balance as receipts came in — an asset
--     sitting on the credit side
--   - per-client profitability showed income of zero for every client
--   - SST charged to clients never reached the output-tax account
--
-- None of that tripped the trial balance, because each individual entry was
-- internally balanced. This adds the link so an issued invoice posts once, and
-- can be proven to have posted.

alter table sales_documents
  add column if not exists journal_entry_id text references journal_entries(id) on delete set null;

-- Posted invoices are looked up by entry when reconciling, and scanned for
-- unposted ones during backfill.
create index if not exists sales_documents_journal_entry_idx
  on sales_documents(journal_entry_id) where journal_entry_id is not null;

-- The income account an invoice's revenue belongs to. Null falls back to the
-- `sales_income` system account, which is what most documents will use.
alter table sales_documents
  add column if not exists income_account_id text references ledger_accounts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Idempotency repair for 0009
-- ---------------------------------------------------------------------------

-- 0009 added this with a bare `alter table ... add constraint`. Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS, so re-running 0009 failed even though every
-- other statement in it was repeatable. Adding it here guarded means a database
-- that never got 0009's version still ends up with the constraint, and one that
-- did is left alone.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bills_capture_fk') then
    alter table bills
      add constraint bills_capture_fk foreign key (capture_id)
      references document_captures(id) on delete set null;
  end if;
end $$;
