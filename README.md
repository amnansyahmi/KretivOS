# KretivOS PWA

A shared internal operating system for Kretivco Mediaworks. This build replaces the earlier role-switching prototype with one collaborative workspace for the small Kretivco team.

## Workspaces

### Database-backed (Neon PostgreSQL)

Each of these owns real records and is reached from the sidebar as its own route.

| Workspace | Route |
| --- | --- |
| Client Workspaces | `/business?tab=customers` |
| Customer Onboarding | `/business?tab=onboarding` |
| CRM and Pipeline | `/business?tab=crm` |
| Sales and Document Lifecycle | `/business?tab=sales` |
| Projects and Delivery | `/business?tab=projects` |
| HR and Team | `/hr` |
| Brand DNA and Asset Library | `/brands` |
| TOFU / MOFU / BOFU Funnel Builder | `/funnels` |
| Knowledge Library | `/knowledge` |
| Automation Builder | `/automations` |
| Approval Inbox | `/approvals` |
| Documents and Reusable Templates | `/documents` |
| Accounting — money in, money out, bills, ledger, reports | `/accounting` |

### HRMS

`/hr` is a role-protected HR workspace with four access levels: HR Admin,
Manager, Finance and Employee. It includes employee self-service, leave balances
and approvals, photo attendance with correction requests, claims and private
receipts, payroll/payslips, onboarding, probation/confirmation/offboarding,
performance, learning and private HR documents.

HRMS currently runs in shared mode, so `/hr` opens directly without login or a
setup key. Keep `HRMS_AUTH_ENABLED=false`. When individual accounts are required,
apply `db/migrations/0005_hrms_security.sql`, set `HRMS_AUTH_ENABLED=true` and
`HRMS_SETUP_KEY`, then open `/hr/login` to create the first HR Admin PIN. Payroll
statutory rates are versioned operational inputs; HR and Finance must verify EPF,
SOCSO, EIS and PCB values against the official Malaysian portals before closing payroll.

#### The employee app

`/hr/app` is the same data on a phone: five tabs, its own manifest and its own
icon, installable to a home screen. Everything an employee does about themselves
happens inside it — payslips, leave, timesheet, claims, documents, their own
details — and the only link that leaves is labelled "Open the full HR workspace".

Notifications reach a closed app once a VAPID keypair is set (see `.env.example`)
and `db/migrations/0015_push_subscriptions.sql` is applied. Without keys the
in-app bell and Inbox work exactly as before and the setup card hides itself.

Two platform limits, neither of which is a bug in this app. Long-pressing the
home-screen icon shows no app shortcuts on iPhone — Apple has never implemented
the manifest `shortcuts` field, so only Edit, Share and Delete appear; the same
icon on Android shows all four. And iOS delivers push only to an app added to
the home screen, never to a Safari tab, so the app asks people to install it
first before offering the switch.

#### Commercial documents with line items

A template that uses the `{{line_items}}` variable — Quotation, Invoice and any
template you add — opens an interactive line-item table in the document composer
instead of a plain text box. Rows can be added, duplicated, reordered and removed;
each row carries a description, quantity, unit and unit price.

`{{subtotal}}`, `{{tax}}`, `{{total}}` and `{{amount_due}}` are then calculated
rather than typed, and become read-only in the editor. Discount is applied to the
subtotal before tax. Currency, discount percentage and the tax label and rate are
all configurable per document, so SST or a zero-rated document both work.

The rows are stored on the generated document, so reopening a saved quotation
restores the table rather than a block of text. The rendered markdown table is
written back into `{{line_items}}`, which keeps the A4 preview, the PDF print
output and the Word export in step with no template changes.

#### Funnel activities

Funnel activities can be reordered within a stage, moved between TOFU, MOFU, BOFU
and Retention, and advanced through Draft → In progress → Ready → Live by tapping
the status chip. Each stage header shows how many of its activities are ready.

### Rendered in the app shell

- Company Command Centre — live figures read from `/api/business`
- Approval Inbox — Sales, Settlement, HR, Automation, Brand DNA, Documents and overdue Knowledge reviews in one queue
- Marketing Plan Builder, Storyboard Studio, AI Prompt Lab — AI generation backed by `/api/*/generate`
- Content Planner — shared weekly plan stored in `planner_entries`
- Technology — static system inventory plus a live database health check
- Settings — opens the workspace that owns each setting

## PWA capabilities

- Web app manifest
- Installable home-screen experience
- Standalone display mode
- Service worker with app-shell caching
- Responsive mobile navigation
- Safe-area compatible viewport
- Local persistence for the active view and sidebar state only; the content plan,
  the projection scenario and all operational records are shared in Neon
- 192px and 512px maskable application icons

## Chef Ammar model included

The prototype includes the supplied 12-month internal scenario:

- RM572,000 management fees
- RM150,700 performance incentives
- RM722,700 total Kretivco income
- Configurable company percentage
- Configurable number of team members
- Monthly and annual allocation calculations
- Weekly RM2-per-unit statement and advertising reimbursement calculator

The projection is stored as an editable scenario, separate from actual sales and from the latest MoU rule configuration. This prevents forecast assumptions from overwriting contractual or actual figures.

## AI connection

The chatbot and every generator use the deployed `ai-nonymauz-cloud` service through a shared server-side client. The current Render deployment is the code default, so an API key is only needed if the service is protected later.

| Route | Produces |
| --- | --- |
| `/api/ai` | Kretiv AI chat replies, grounded in live records |
| `/api/knowledge/ask` | An answer drawn only from the knowledge library, with sources |
| `/api/briefing` | An operations briefing over live pipeline, cash and delivery |
| `/api/marketing/generate` | A ten-section marketing plan |
| `/api/storyboard/generate` | A shot-by-shot storyboard |
| `/api/prompt/generate` | A model-specific image or video prompt |
| `/api/funnels/generate` | A four-stage TOFU/MOFU/BOFU/retention funnel |
| `/api/funnels/content` | Grounded hooks, copy, CTA, visual direction and channel versions for funnel activities |
| `/api/ai/status` | Live Render health, model, RAG and image capability status |
| `/api/ai/studio` | Shared AI conversations, prompt templates, outputs, feedback and usage |
| `/api/ai/threads` | Persistent header-copilot conversations, shared with AI Studio |
| `/api/ai/image` | Pollinations Flux image generation through ai-nonymauz-cloud |
| `/api/search` | Cross-workspace record search behind the ⌘K command palette |
| `/api/notifications` | Shared automation reminders for the header bell |

### Streaming

`/api/ai` accepts `stream: true` and returns Server-Sent Events: a `meta` frame
carrying the citation list before the first token, then `delta` frames, then
`done` with the model and token usage. The header copilot uses it, so a deep-mode
answer appears as it is written instead of after a minute of silence.

If the deployment does not actually stream — a proxy in front of Render can
buffer or strip SSE — `aiNonymauzChatStream` falls back to the buffered call and
reports `streamed: false`. A failure *after* the first token keeps the text that
already arrived rather than replaying a contradictory second answer.

### Kretiv AI Studio

`/ai-studio` exposes the capabilities already deployed on Render without replacing the existing chatbot:

- fast, normal and deep reasoning modes with optional explicit model selection
- live KretivOS business and customer context
- the cloud service's BM25 RAG knowledge and web/weather tools
- shared Neon-backed conversation history, saved outputs, feedback and token telemetry
- reusable executive, client, sales, marketing, research and content prompts
- image generation using the deployed Pollinations Flux endpoint

### AI Proposal Package

`/document-ai` turns one selected customer and CRM opportunity into a linked,
human-reviewed draft package:

- a reusable Proposal document and matching Sales record
- an editable line-item Quotation whose price is controlled by the operator, not AI
- a Project Brief document plus a Planning-stage Project
- a Not started Customer Onboarding record with an editable checklist

The generator reads CRM, recent sales and delivery records, Brand DNA and linked
knowledge. Saving is idempotent by package ID, and never approves or sends a document.

### AI Funnel Content

Each saved or sandbox funnel can generate an editable content draft for every activity.
The generator reads the funnel objective, audience, offer, selected channels, Brand DNA
and linked customer knowledge. It returns a hook, primary copy, CTA, visual direction,
production notes and channel-specific versions. Nothing is saved or published until the
operator reviews the full batch and chooses **Save all content drafts**.

Apply `db/migrations/0004_ai_studio.sql` to Neon before opening the shared history
workspace. The header copilot writes into the same tables, so a question asked
from the header is resumable in AI Studio rather than living in a second history.

### App shell

- **⌘K command palette** — searches workspaces, customers, opportunities, sales
  documents, projects and knowledge in one place, mounted in the root layout so
  the shortcut works on every route. Destinations match locally and instantly;
  records are fetched behind a debounce, so an unavailable database costs only
  the record half of the results.
- **Notification bell** — reads the shared reminders the automation engine and the
  daily cron have been writing into `notifications` since they were added.
  Personal HR notifications stay behind the HR session check and are not shown here.
- **Toasts** — one dismissal-aware layer (`components/toast.tsx`) replacing the
  per-page `notice`/`failure` strings.

### Grounding

`lib/ai-context.ts` supplies AI features with real records instead of leaving them
to guess. It provides two things:

- **Knowledge retrieval** — chunked hybrid search (see below). Every result carries
  its owner and review schedule; overdue or unscheduled sources are disclosed to the
  model so current strategy, pricing or policy is not silently treated as fresh.
- **An operations snapshot** — pipeline, receivables, settlements, delivery and
  cleared cash rolled up from the shared tables, plus a list of concrete items
  needing attention. The workspace the question was asked from decides which
  figures lead: Finance leads on receivables and cash, Settlement on settlements.

#### Chunked hybrid retrieval

Entries are split into heading-aware chunks (`lib/knowledge-chunks.ts`) and stored
in `knowledge_chunks`. Retrieval fuses three independent rankings by reciprocal
rank, because each covers the others' blind spots:

| Retriever | Covers |
| --- | --- |
| `to_tsvector('english', …)` | Stemmed English |
| `to_tsvector('simple', …)` | Malay and proper nouns the English dictionary destroys |
| `pg_trgm` word similarity | Typos and partial words, scored per term |

This replaced whole-entry English-only ranking, which had two failures worth
naming. A long MoU answers a question somewhere in its middle, and truncating the
winning document to its first 1200 characters threw exactly that part away.
And `'english'` does not stem Malay, so "bayaran" or "penghantaran" matched
nothing and every Malay question fell through to a crude ILIKE scan.

Short questions are widened with workspace vocabulary before searching — "is it
paid?" carries no searchable signal alone, but inside Settlement it should still
reach the settlement documents. Questions over eight words are left alone so the
expansion cannot outweigh what was actually asked.

Indexing runs on every knowledge write, and `indexStaleEntries()` backfills when
the library is listed. Until `0006_knowledge_chunks.sql` is applied, retrieval
falls back to the previous entry-level search.

Retrieved extracts are numbered so the model cites them as `[1]`, `[2]`, and the
numbers resolve back to real entries in the UI. The chat and the Knowledge
workspace both show which documents an answer came from. When nothing matches,
the answer says so rather than inventing one, and both degrade to a clearly
labelled ungrounded reply if the database is unreachable.

Each generator asks for a JSON object matching a fixed schema and falls back to a
deterministic starter when AI is unconfigured or unavailable, so no button is ever dead.
The response reports `source` as either `ai-nonymauz-cloud` or `starter`, and the UI says
which one produced the result.

```bash
cp .env.example .env.local
```

Configure:

```env
AI_NONYMAUZ_BASE_URL=https://ai-nonymauz-cloud.onrender.com
AI_NONYMAUZ_API_KEY=
AI_NONYMAUZ_MODEL=
```

The browser never receives the API key.

## Server automations

Automation recipes, events, approvals, runs and notifications are stored in Neon.
Business, funnel, document and knowledge writes dispatch stable server events, and
idempotency keys prevent the same recipe/event pair from executing twice. Sensitive
recipes wait in the Approval Inbox before their actions run.

Vercel calls `/api/automations/cron` daily at `00:15 UTC` (`08:15` Malaysia time)
to create non-duplicated reminders for overdue or upcoming records. Set
`CRON_SECRET` in production if the route should reject unsigned manual calls.

## Accounting

`/accounting` is a double-entry ledger with a money-in / money-out interface.
Debits and credits appear only in the Journal tab; everyone else records a bill,
pays it, photographs a receipt and reads a report.

### Why double-entry

`finance_transactions` is a single-entry cash log — one row, one amount, a
category string. It can answer "how much went out in July" and nothing else: no
balance sheet, no statement of what is owed to whom, no concept of which bank
account the money moved through. It is left in place and still works; accounting
reads from the journal instead.

Every movement posts through `postEntry` in `lib/accounting.ts`, which enforces:

- debits equal credits, in integer cents
- each line is one-sided
- accounts exist and are active
- the period is open
- the entry and its lines commit together

The database enforces the same rules through a deferred constraint trigger. That
duplication is deliberate — an application check does not survive someone fixing
data by hand, and an unbalanced entry silently corrupts every derived report.

Money is handled in cents throughout. `0.1 + 0.2 !== 0.3` in floating point, and
in a ledger that drift is the difference between a balanced entry and a rejected
one.

Corrections post a reversing entry rather than deleting: a posted entry is a
historical assertion, and erasing it defeats the audit trail.

### Navigation

`/accounting` uses the same left-hand shell as `/hr` (`components/accounting-shell.tsx`,
following `components/hrms-shell.tsx`) rather than a tab strip. The strip had
grown to ten items, which scrolled horizontally on a laptop and hid whichever
section you were not already looking at. Grouping also says something a flat row
cannot — that Bills, Vendors and Payments are one job.

Sections carry a count when work is waiting in them: overdue bills, settlements
that have not reached the ledger. `?tab=` deep links still work and the address
bar tracks the section, so links remain shareable.

### One app, not two

Finance and Accounting covered the same ground with two incompatible models, and
the same money was recorded in both. Marking an invoice paid posted to the ledger
*and* inserted a cash-log row; marking a settlement paid inserted a cash row and
nothing else; an automation inserted a third. "How much did we earn" had two
answers depending on which screen you opened.

Everything now lives in `/accounting` and posts to one ledger:

| Was | Now |
| --- | --- |
| `/business?tab=finance` | `/accounting?tab=transactions` — redirected |
| Free-text category | An income or expense account |
| No bank account | The account the money actually moved through |
| A row in `finance_transactions` | A balanced journal entry, mirrored to the cash log for history |
| Settlements paid to a cash row | Settlements posted to settlement income |

`finance_transactions` is kept as readable history rather than a competing
source of truth. A row carrying a `journal_entry_id` is on the ledger; one
without predates it, and the Transactions list marks it **Not on ledger** so the
difference is visible instead of silently skewing the reports. Backfill actions
post what is missing.

The AI operations snapshot reads income and expense from the ledger too, so the
copilot and the reports cannot disagree.

### Both halves of the money flow

A bill debits an expense and credits payables. An invoice debits receivables and
credits income, with any SST charged split out to the output-tax account, because
tax collected from a client is a liability owed to the government rather than
revenue.

Revenue is recognised when the invoice is **issued**, not when it is paid — a
receipt afterwards only moves the amount from receivables to the bank.
Recognising on payment instead would misstate every period an invoice straddles.

The invoice side was missing when accounting first shipped: nothing debited
`accounts_receivable` or credited `sales_income`, so raising an invoice produced
no journal entry at all. Income read as zero on every report, receipts drove
receivables negative, and per-client profitability showed nothing — none of which
tripped the trial balance, because each individual entry was internally balanced.

Posting is idempotent on `sales_documents.journal_entry_id` and runs on every
sales-document write. Invoices raised before this existed are counted in the
Accounting workspace with a **Post them now** action that backfills them at their
own issue dates, so each lands in the period it belongs to.

Marking an invoice paid from the Sales workspace posts both halves: the revenue,
and the receipt that clears it into the default bank account. Recording the
receipt in the Payments screen instead lets the operator choose the account, and
the Sales action skips anything already allocated there.

### AI in the accounting workspace

Two rules shape all of it:

1. **The model never produces a figure that enters the books.** Amounts, totals,
   variances and duplicate matches are computed in `lib/accounting-signals.ts`.
   The model reads those and explains them.
2. **The model never invents an account.** Classification is a choice from a
   supplied list of real codes, and a reply outside that list is discarded
   rather than created.

A model asked to spot a duplicate payment will occasionally invent one, and an
invented duplicate in a month-end review is worse than no review.

| Feature | How it works |
| --- | --- |
| **Cost classification** | The keyword table answers instantly for suppliers Kretivco already uses. The model is consulted only when that misses, so a known vendor never waits on a network call and an unknown one still gets a suggestion the reviewer can change. |
| **Month-end review** | Duplicates, spend spikes, missing recurring bills, uncategorised cost, stale receivables and unposted documents are all detected deterministically. The model ranks them and writes the plain-English summary. |
| **Receipt reading** | Vision extraction, with every field re-parsed and confidence-scored before a human confirms it. |

Detection is tested against the cases it is meant to catch *and* the ones it must
not flag: a monthly retainer is not a duplicate, a first-ever month is not a
spike, and a supplier who stopped six months ago is not a missing bill. Those
false positives are what make a review get ignored.

Every AI path degrades to a deterministic answer, so the review still lists the
same items when the service is unavailable — it just describes them more plainly.

### Payroll

Closing payroll expenses **gross** pay, not net: the deductions are the
employee's money the company is holding on their behalf and passing to EPF,
SOCSO and LHDN. Posting net would understate both the wage bill and the
liability. Employer contributions are an additional cost on top, not a deduction
from it.

What is owed is split by who it is owed to — net pay, EPF, SOCSO and EIS, PCB —
because a single payroll liability cannot answer "how much EPF do we owe this
month", which is the question actually asked when a remittance falls due.

Paying payroll moves only net pay out of the bank. The statutory portion stays a
liability until it is remitted, which happens on a different date and to a
different recipient; clearing it early would claim the government had been paid
when it had not.

The payroll records themselves stay in the HR workspace, where they are
role-gated and employee-facing. Only the money comes across, and a posting
failure leaves the payroll unposted and retryable rather than half-recorded.

### What belongs in the accounting app

The test is whether something **records or reports money**. If it does, it lives
in Accounting; if it is a client-facing workflow that merely involves money, it
stays where it is and posts to the ledger.

| Moved in | Why |
| --- | --- |
| Money in / out | Was the Finance tab, recording the same money twice |
| Settlements | Units times a fee — arithmetic on money with no workflow outside it |
| Budget & forecast | A forecast nobody can compare against actuals is a spreadsheet with opinions |

| Stayed out | Why |
| --- | --- |
| Sales & Documents | The composer, templates and quotations are a sales workflow; invoices post from there |
| HR payroll and claims | Confidential and employee-facing; they post rather than move |
| Approval Inbox | A cross-cutting queue, not an accounting one |
| CRM, Projects, Proposal Package | None of them record money |

Budget and forecast is deliberately never merged into the profit and loss. It is
what the team intends; the ledger is what happened. The variance between them is
the only reason to keep both.

### What a complete accounting system still needs

Present: chart of accounts with management, double-entry journal, bank and cash
accounts, period close, vendors, bills, AP aging, payments with allocation,
invoices with AR aging, direct cash movements, settlements, OCR capture, profit
and loss, balance sheet, trial balance and per-client profitability.

Not built yet, roughly in the order they will be missed:

| Gap | Why it matters |
| --- | --- |
| Bank reconciliation | `bank_transactions` exists with import de-duplication, but there is no CSV import or matching screen, so nothing proves the ledger agrees with the bank |
| Payroll posting | HR payroll never reaches the journal, so salaries and EPF/SOCSO/EIS liabilities are missing from the accounts entirely |
| Credit notes | Neither customer nor vendor; bills reject negative lines, so a refund or discount has no path |
| Opening balances | No way to enter what was owed and owing on the day the ledger started |
| Account drill-down | The trial balance shows totals with no way to click into the entries behind them |
| Year-end close | `retained_earnings` exists but nothing rolls the year's profit into it |
| Recurring bills | Rent, subscriptions and ad platforms are re-keyed every month |
| Customer statements | No "here is what you owe" document to send |
| Multi-currency | `currency` and `exchange_rate` are on the tables, but nothing revalues or sources a rate |
| SST return | Input and output tax accumulate correctly; the return itself is still manual |
| Budgets, fixed-asset depreciation, audit-trail UI | `audit_logs` is written on every change and never displayed |

### Document capture (OCR)

Upload or photograph a receipt, supplier invoice or cheque. The image is stored
**first** and read second, so an unavailable or failed extraction still leaves a
filed document that can be keyed by hand.

- Fields are re-parsed and re-checked by `lib/ocr-parse.ts` rather than trusted
  as returned: amounts (`RM1,234.50`, `1.234,50`, trailing-minus negatives),
  day-first Malaysian dates, and totals reconciled against each other.
- Confidence is the **lowest** of the fields that must be right, not the average
  — averaging hides exactly the case a reviewer needs to see first.
- Duplicate detection fingerprints vendor + date + total, deliberately excluding
  the document number, because the commonest duplicate is the same receipt
  photographed twice by two people.
- Nothing posts without a human confirming. The original image stays attached to
  the transaction as evidence.

`vision` was a declared mode on the AI service that had never been used, and
`AiMessage.content` was a plain string, so the client could not send an image at
all. It now accepts OpenAI-style content parts.

### LHDN e-Invoice (MyInvois)

**Untested against LHDN.** Submitting needs a client id and secret issued against
a registered TIN, which were not available when this was written. The client
follows the published API shape, and every submission stores the exact payload
sent, because LHDN validates what was submitted and the document may since have
been edited.

Before going live, verify against the current MyInvois SDK docs:

- the classification and tax-type code lists, which LHDN revises
- required address and identity fields for your taxpayer profile
- whether your submissions need the `onbehalfof` intermediary header

Submission is asynchronous: `submit` returns once LHDN accepts the document for
processing, then `refresh` polls for validation. A validated document can be
cancelled for 72 hours; after that the route says to issue a credit note rather
than letting the API reject it.

Leave the `MYINVOIS_*` variables blank to disable submission — the accounting
workspace works and reports e-Invoice as unconfigured.

## HRMS concurrency

The whole HR record set — employees, leave, claims, payroll, attendance, goals,
learning and settings — lives in one `workspace_state` row. Both `/api/hr` and
`/api/hr/attendance` write to it, across roughly a dozen paths.

Those writes used to be unconditional:

```sql
do update set data = excluded.data, version = workspace_state.version + 1
```

The `version` column was read on load and ignored on save, which made every write
a lost update. Two people clocking in at the same time both loaded v5; the second
commit was built from a snapshot that predated the first, and silently erased it.
No error, and nothing in the audit log.

`lib/workspace-state.ts` now guards the write on the version it read and re-runs
the mutation against fresh state when that guard fails. Because a mutation can
run more than once, it must be free of side effects — notifications and audit
entries are queued and flushed only after the state commits (`deferredEffects()`
in `app/api/hr/route.ts`). Re-running also means balance and duplicate checks are
decided against committed state rather than a stale read. After the retries are
exhausted the request returns **409**, not 400: the write is valid, just contended.

Neon's HTTP driver gives each query its own connection, so session-scoped
`pg_advisory_lock` is not available; compare-and-swap is what works over that
transport.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

```bash
npm test        # node test runner, no framework
npm run lint    # tsc --noEmit
```

`npm run lint` previously invoked `next lint`, which has no config in this repo
and drops into an interactive setup prompt; it is now the type check that
actually runs.

## Production foundation still required

The commercial record set now runs on Neon PostgreSQL with audit-log writes. Before
using KretivOS as the company system of record, still connect:

- Authentication and session handling outside `/hr`. HRMS routes already use
  opaque HTTP-only sessions, PIN hashes, role permissions and user-attributed audit logs;
  the remaining workspaces still need the same identity layer.
- Server-side document/PDF generation
- Scheduled workers for Tuesday and monthly settlements
- Live integrations for Google, GitHub, payment, marketplace and advertising platforms
- Object storage for attendance photos and HR files. Both are stored as base64
  data URLs in `assets.storage_url`, one row per file. They do not sit inside the
  HR blob, so they neither bloat it nor affect the concurrency above — but a text
  column is still the wrong home for binary.
- Broader test coverage and a CI pipeline. `npm test` currently covers the
  workspace-state concurrency logic only.
- **Dark mode.** `tailwind.config.ts` sets `darkMode: ["class"]` and `globals.css`
  defines the HSL token set, but roughly 500 hardcoded hex values across the
  workspace pages bypass both. Converting them needs a per-usage decision rather
  than a find-and-replace, because the same value is a background in one place and
  text in another and those invert in opposite directions. A toggle shipped before
  that work would leave most workspaces unreadable, so it is deliberately not wired up.

See `docs/PRODUCT_SCOPE.md` and `docs/DATA_MODEL.md`.
