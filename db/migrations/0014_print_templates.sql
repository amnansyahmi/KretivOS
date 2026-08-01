-- Printable quotations, invoices and receipts.
-- Apply after 0013_bank_reconciliation.sql.
--
-- The three documents Kretivco actually sends to clients were produced by hand
-- outside the system. This stores their layout so the same paper comes out of
-- KretivOS, and stores it as data rather than markup so the wording, the bank
-- details and the payment terms can be changed without a deployment.
--
-- Only the words are configurable. The geometry — logo left, company block,
-- document heading right, ruled table, right-aligned totals, signature pair —
-- is fixed in the renderer, because it is the part that makes the three
-- documents recognisably one family.

alter table organizations add column if not exists logo_url text not null default '/kretivco-logo.png';

create table if not exists print_templates (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  -- Matches sales_documents.type, so a document finds its template by kind.
  document_type text not null,
  -- The large word in the top right.
  heading text not null,
  -- "Invoice No#", "QNo#", "Receipt No#" — they differ, so it is not derived.
  number_label text not null,
  -- Numbered list under "Note:". An array so the renderer numbers them and the
  -- operator can reorder or delete one without renumbering by hand.
  notes jsonb not null default '[]'::jsonb,
  -- The unnumbered line after the notes.
  closing_line text not null default 'Thank you for your business!',
  show_signatures boolean not null default true,
  issued_by_label text not null default 'Issued by:',
  accepted_by_label text not null default 'Accepted by:',
  -- Substituted into note text as {{bankName}} and {{bankAccountNumber}} rather
  -- than typed into every note, so changing bank once changes every document.
  bank_name text not null default '',
  bank_account_number text not null default '',
  payment_terms_days integer not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_type)
);

drop trigger if exists print_templates_set_updated_at on print_templates;
create trigger print_templates_set_updated_at before update on print_templates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- The three templates as supplied, verbatim
-- ---------------------------------------------------------------------------
--
-- `on conflict do nothing`: this seeds a starting point. Once someone has
-- edited the wording, re-running the migration must not overwrite them.

insert into print_templates (
  organization_id, document_type, heading, number_label, notes, closing_line,
  bank_name, bank_account_number, payment_terms_days
) values
  ('org-kretivco', 'Invoice', 'INVOICE', 'Invoice No#',
   jsonb_build_array(
     'Please make payment to {{bankName}} {{bankAccountNumber}} KRETIVCO MEDIAWORKS.',
     'Please indicate invoice number when making payment to us.',
     'Payment due within {{paymentTermsDays}} days from the invoice date.',
     'Late payment may be subject to a surcharge as agreed in the service agreement.',
     'Email us at {{email}}',
     'Whatsapp us at {{phone}}'
   ),
   'Thank you for your business!', '', '', 14),

  ('org-kretivco', 'Quotation', 'QUOTATION', 'QNo#',
   jsonb_build_array(
     'Please make payment to {{bankName}} {{bankAccountNumber}} KRETIVCO MEDIAWORKS.',
     'Please indicate quotation number when making payment to us.',
     'Full payment needed for invoice below RM2000 and 80% deposit must be paid before making the first draft for invoice price RM2000 and above.',
     'Progress will be done in 14 days after final draft has been confirmed by customer.',
     'Deposit is not refundable after the booking confirmed and first draft has been made.',
     'Email us at {{email}}',
     'Whatsapp us at {{phone}}'
   ),
   'Thank you for your business!', '', '', 14),

  ('org-kretivco', 'Receipt', 'RECEIPT', 'Receipt No#',
   jsonb_build_array(
     'This receipt confirms payment received for the above job/invoice.',
     'Please retain this receipt for your reference.',
     'For any discrepancy, please contact us within 7 days of receipt date.',
     'Email us at {{email}}',
     'Whatsapp us at {{phone}}'
   ),
   'Thank you for your business!', '', '', 14)
on conflict (organization_id, document_type) do nothing;

-- The supplied templates carry a delivery line in the totals that the line-item
-- editor had no field for, so it could never be printed with a value.
alter table sales_documents add column if not exists delivery_amount numeric(14,2) not null default 0;

-- The letterhead. These print on every document, and the seeded organisation
-- carried only a short name, so a first print came out with an empty company
-- block. Each field is filled only when blank, so a deployment that has already
-- set its own details keeps them.
update organizations
set name = case when name is null or name = '' or name = 'Kretivco' then 'Kretivco Mediaworks' else name end,
    registration_number = case when registration_number is null or registration_number = '' then 'SA0463354-A' else registration_number end,
    address_line1 = case when address_line1 is null or address_line1 = '' then 'No.15A, Jalan USJ1/19' else address_line1 end,
    city = case when city is null or city = '' then 'Subang Jaya' else city end,
    state_code = case when state_code is null or state_code = '' then 'Selangor' else state_code end,
    postcode = case when postcode is null or postcode = '' then '47600' else postcode end,
    contact_email = case when contact_email is null or contact_email = '' then 'kretivco@gmail.com' else contact_email end,
    contact_phone = case when contact_phone is null or contact_phone = '' then '+6011-21149204 / +6019-3663805' else contact_phone end
where id = 'org-kretivco';
