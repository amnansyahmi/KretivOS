-- Document capture (OCR) and LHDN MyInvois e-Invoice.
-- Apply after 0008_accounting_core.sql.

-- ---------------------------------------------------------------------------
-- Document capture
-- ---------------------------------------------------------------------------

-- A captured document is evidence first and a transaction second. The image is
-- kept for the life of the record — for SST and LHDN purposes the original is
-- what matters, not the numbers someone typed from it — and the extraction is
-- stored beside it so a later correction can be compared against what the model
-- actually read.
create table if not exists document_captures (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  kind text not null default 'receipt' check (kind in ('receipt', 'invoice', 'cheque', 'statement', 'other')),
  -- The original image or PDF, stored in `assets` like attendance photos.
  asset_id text references assets(id) on delete set null,
  original_filename text not null default '',
  mime_type text not null default '',
  file_size integer not null default 0,

  status text not null default 'Uploaded' check (status in (
    'Uploaded',        -- stored, not yet read
    'Extracting',      -- handed to the model
    'Needs review',    -- read, waiting for a human
    'Failed',          -- extraction could not produce usable fields
    'Posted',          -- confirmed and written to the ledger
    'Rejected',        -- a human discarded it
    'Duplicate'        -- matches something already captured
  )),

  -- Everything the extractor returned, including fields not promoted to columns.
  extracted jsonb not null default '{}'::jsonb,
  -- Per-field confidence, 0..1, keyed the same as `extracted`.
  confidence jsonb not null default '{}'::jsonb,
  -- Lowest confidence across the fields that matter, for sorting the queue.
  overall_confidence numeric(4,3) not null default 0,

  -- Promoted for querying and duplicate detection.
  document_date date,
  vendor_name text not null default '',
  vendor_id text references vendors(id) on delete set null,
  document_number text not null default '',
  currency text not null default 'MYR',
  subtotal numeric(14,2),
  tax_amount numeric(14,2),
  total numeric(14,2),

  -- Cheque-specific.
  cheque_number text not null default '',
  cheque_payee text not null default '',
  cheque_bank text not null default '',
  cheque_amount_words text not null default '',

  -- Fingerprint of vendor + date + total. Not unique: a genuine duplicate needs
  -- a human decision, so this flags rather than blocks.
  duplicate_fingerprint text not null default '',
  duplicate_of text references document_captures(id) on delete set null,

  bill_id text references bills(id) on delete set null,
  journal_entry_id text references journal_entries(id) on delete set null,
  payment_id text references payments(id) on delete set null,

  extraction_model text not null default '',
  extraction_ms integer not null default 0,
  extraction_error text not null default '',
  notes text not null default '',
  uploaded_by text references users(id) on delete set null,
  reviewed_by text references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_captures_status_idx
  on document_captures(organization_id, status, created_at desc);
create index if not exists document_captures_fingerprint_idx
  on document_captures(organization_id, duplicate_fingerprint) where duplicate_fingerprint <> '';

-- Line items the extractor read, kept separately so they can be edited in the
-- review screen before anything is posted.
create table if not exists document_capture_lines (
  id text primary key default gen_random_uuid()::text,
  capture_id text not null references document_captures(id) on delete cascade,
  description text not null default '',
  quantity numeric(14,4) not null default 1,
  unit_price numeric(14,4) not null default 0,
  amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  -- Suggested by the classifier; the reviewer confirms or changes it.
  suggested_account_id text references ledger_accounts(id) on delete set null,
  confidence numeric(4,3) not null default 0,
  line_order integer not null default 0
);

create index if not exists document_capture_lines_capture_idx on document_capture_lines(capture_id);

alter table bills
  add constraint bills_capture_fk foreign key (capture_id)
  references document_captures(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Taxpayer identity, required by LHDN on both sides of every e-Invoice
-- ---------------------------------------------------------------------------

alter table organizations add column if not exists tin text not null default '';
alter table organizations add column if not exists registration_number text not null default '';
alter table organizations add column if not exists sst_number text not null default '';
-- Malaysia Standard Industrial Classification, mandatory on a submission.
alter table organizations add column if not exists msic_code text not null default '';
alter table organizations add column if not exists business_activity text not null default '';
alter table organizations add column if not exists address_line1 text not null default '';
alter table organizations add column if not exists address_line2 text not null default '';
alter table organizations add column if not exists city text not null default '';
alter table organizations add column if not exists state_code text not null default '';
alter table organizations add column if not exists postcode text not null default '';
alter table organizations add column if not exists country_code text not null default 'MYS';
alter table organizations add column if not exists contact_phone text not null default '';
alter table organizations add column if not exists contact_email text not null default '';

alter table customers add column if not exists tin text not null default '';
alter table customers add column if not exists registration_number text not null default '';
alter table customers add column if not exists sst_number text not null default '';
-- NRIC / passport / army number, used when a buyer has no TIN.
alter table customers add column if not exists identity_type text not null default '';
alter table customers add column if not exists identity_number text not null default '';
alter table customers add column if not exists address_line1 text not null default '';
alter table customers add column if not exists address_line2 text not null default '';
alter table customers add column if not exists city text not null default '';
alter table customers add column if not exists state_code text not null default '';
alter table customers add column if not exists postcode text not null default '';
alter table customers add column if not exists country_code text not null default 'MYS';
alter table customers add column if not exists contact_phone text not null default '';

-- Classification and tax codes per line, from the LHDN code lists.
alter table sales_documents add column if not exists classification_code text not null default '022';
alter table sales_documents add column if not exists currency_code text not null default 'MYR';
alter table sales_documents add column if not exists exchange_rate numeric(18,8) not null default 1;

-- ---------------------------------------------------------------------------
-- e-Invoice submissions
-- ---------------------------------------------------------------------------

create table if not exists einvoice_submissions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  sales_document_id text references sales_documents(id) on delete set null,
  -- Self-billed documents reference a vendor instead of a customer.
  bill_id text references bills(id) on delete set null,

  document_type text not null default '01',   -- 01 Invoice, 02 Credit, 03 Debit, 04 Refund, 11 Self-billed…
  document_version text not null default '1.1',
  -- Our own invoice number, which LHDN echoes back as the internal id.
  internal_id text not null,

  -- Identifiers returned by MyInvois.
  submission_uid text not null default '',
  document_uuid text not null default '',
  long_id text not null default '',

  status text not null default 'Draft' check (status in (
    'Draft',      -- built, not sent
    'Submitted',  -- accepted for processing
    'Valid',      -- validated by LHDN
    'Invalid',    -- rejected; see validation_errors
    'Cancelled',  -- cancelled by us inside the 72-hour window
    'Rejected',   -- buyer requested rejection
    'Failed'      -- transport or auth failure, safe to retry
  )),

  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  -- The exact UBL payload sent, kept because LHDN validates against what was
  -- submitted, not against what the record says now.
  payload jsonb not null default '{}'::jsonb,
  payload_sha256 text not null default '',
  response jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,

  qr_url text not null default '',
  submitted_at timestamptz,
  validated_at timestamptz,
  -- LHDN allows cancellation only within 72 hours of validation.
  cancellable_until timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  attempts integer not null default 0,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists einvoice_submissions_document_idx on einvoice_submissions(sales_document_id);
create index if not exists einvoice_submissions_status_idx on einvoice_submissions(organization_id, status, created_at desc);
create unique index if not exists einvoice_submissions_uuid_idx
  on einvoice_submissions(document_uuid) where document_uuid <> '';

drop trigger if exists document_captures_set_updated_at on document_captures;
create trigger document_captures_set_updated_at before update on document_captures
for each row execute function set_updated_at();

drop trigger if exists einvoice_submissions_set_updated_at on einvoice_submissions;
create trigger einvoice_submissions_set_updated_at before update on einvoice_submissions
for each row execute function set_updated_at();

update organizations
set tin = coalesce(nullif(tin, ''), ''),
    country_code = coalesce(nullif(country_code, ''), 'MYS')
where id = 'org-kretivco';
