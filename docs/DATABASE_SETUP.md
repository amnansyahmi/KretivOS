# KretivOS Database Setup

KretivOS uses Neon PostgreSQL as the shared production database.

## Security first

Never commit a live database connection string to GitHub. Store it only in local `.env.local` and Vercel Environment Variables.

If a connection string is shared in chat, email, a ticket, screenshot, or source code, rotate the database password in Neon before using it in production.

For production, create a dedicated application role instead of using the database owner account for normal runtime traffic.

## Environment variable

Add the pooled Neon connection string as:

```env
DATABASE_URL="postgresql://APP_USER:APP_PASSWORD@YOUR-ENDPOINT-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
```

Add `DATABASE_URL` to Vercel for Production, Preview, and Development, then redeploy.

## Apply the schema

1. Open the Neon project.
2. Open **SQL Editor**.
3. Run the migrations in order:

   | File | Adds |
   | --- | --- |
   | `0001_initial.sql` | Core schema |
   | `0002_seed_reference_data.sql` | Reference data |
   | `0003_business_idempotency.sql` | Idempotency keys for business writes |
   | `0004_ai_studio.sql` | AI conversations, prompts, saved outputs, usage |
   | `0005_hrms_security.sql` | HRMS accounts and sessions (only when enabling HR login) |
   | `0006_knowledge_chunks.sql` | Chunked bilingual knowledge retrieval |
   | `0007_shared_planner_projection.sql` | Shared content plan and projection scenario |
   | `0008_accounting_core.sql` | Double-entry ledger, vendors, bills, payments, bank import |
   | `0009_capture_and_einvoice.sql` | OCR document capture and LHDN e-Invoice |
   | `0010_invoice_posting.sql` | Customer invoices post to the ledger |
   | `0011_unify_cash_and_settlements.sql` | Cash movements and settlements post to the ledger |
   | `0012_payroll_posting.sql` | Payroll posts to the ledger, with statutory payables |

4. Open `/api/db/health` on the deployed KretivOS URL.

Migrations 0006 through 0012 are additive and safe to run on an existing database.
Until they are applied, knowledge retrieval falls back to the previous
entry-level search, and the Content Planner and Financial Projection show a
banner saying their inputs are not being shared.

All twelve have been applied to Postgres 16 from an empty database and are
verified idempotent: 0006 through 0012 can be re-run without error.

## Verify the ledger

Run this after applying the migrations, and any time the accounting code
changes:

```bash
DATABASE_URL="postgresql://…" node scripts/verify-ledger.mjs --probe
```

It reports which migrations are applied, checks the ledger invariants — debits
equal credits, no unbalanced entry, accounts receivable and payable agreeing
with their subledgers, no over-allocated payment — and counts records that
never reached the journal. With `--probe` it also confirms the database
*refuses* what it should: an unbalanced entry, a line carrying both debit and
credit, and posting into a closed period. The probe runs inside a transaction
that is always rolled back, so it leaves nothing behind.

Use the direct (non-pooler) Neon hostname: the probe holds one transaction open
across several statements.

## Run the whole app against a local database

The application talks to Neon over HTTP, which used to mean the accounting code
could only ever run in production. `scripts/neon-local-proxy.mjs` speaks that
same HTTP protocol in front of an ordinary Postgres, so the unmodified app runs
against a throwaway database:

```bash
./scripts/local-db.sh up      # create, migrate, start the shim
```

Then, in another shell:

```bash
DATABASE_URL=postgresql://postgres@localhost:5433/kretivos \
NEON_HTTP_ENDPOINT=http://localhost:4444 npm run dev
```

`./scripts/local-db.sh reset` rebuilds from the migrations; `down` stops
everything. The proxy has no authentication and is for development only.

A successful response looks like:

```json
{
  "ok": true,
  "database": "neondb",
  "serverTime": "...",
  "postgresVersion": "PostgreSQL ..."
}
```

## Current database scope

The initial schema covers:

- Organizations and internal users
- Customers, contacts, brands and Brand DNA
- Marketing channel master records
- CRM opportunities
- Sales documents
- Finance transactions, scenarios and settlements
- Projects, tasks and onboarding
- Funnels, stages and activities
- Content templates
- Knowledge entries
- Document templates and generated documents
- Asset metadata
- Automation recipes, events, approvals and runs
- Notifications and audit logs
- Temporary workspace state used during localStorage migration

## Migration plan from browser storage

The application currently has browser-stored records from the prototype. Migration should happen module by module:

1. Authentication and organization context
2. Customers, contacts and brands
3. CRM, sales, finance, settlements and projects
4. Funnels, channel master and content templates
5. Knowledge and Brand DNA
6. Document templates, generated documents and assets
7. Automations, notifications and audit history
8. Remove localStorage as the source of truth

During migration, localStorage may be retained only as an offline cache. PostgreSQL must become the authoritative record.

## Connection choice

Use the Neon pooled hostname for deployed application traffic. Administrative tools and migration systems may use a direct, non-pooler connection when required.
