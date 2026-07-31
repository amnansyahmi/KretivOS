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
| Finance and Cash Outlook | `/business?tab=finance` |
| Weekly Tuesday Settlement | `/business?tab=settlements` |
| Projects and Delivery | `/business?tab=projects` |
| HR and Team | `/hr` |
| Brand DNA and Asset Library | `/brands` |
| TOFU / MOFU / BOFU Funnel Builder | `/funnels` |
| Knowledge Library | `/knowledge` |
| Automation Builder | `/automations` |
| Approval Inbox | `/approvals` |
| Documents and Reusable Templates | `/documents` |

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
- Chef Ammar 12-Month Financial Projection — an editable scenario model, deliberately separate from actual sales
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

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production foundation still required

The commercial record set now runs on Neon PostgreSQL with audit-log writes. Before
using KretivOS as the company system of record, still connect:

- Authentication and session handling outside `/hr`. HRMS routes already use
  opaque HTTP-only sessions, PIN hashes, role permissions and user-attributed audit logs;
  the remaining workspaces still need the same identity layer.
- Object storage for files
- Server-side document/PDF generation
- Scheduled workers for Tuesday and monthly settlements
- Live integrations for Google, GitHub, payment, marketplace and advertising platforms
- Automated tests, linting and a deployment pipeline
- **Dark mode.** `tailwind.config.ts` sets `darkMode: ["class"]` and `globals.css`
  defines the HSL token set, but roughly 500 hardcoded hex values across the
  workspace pages bypass both. Converting them needs a per-usage decision rather
  than a find-and-replace, because the same value is a background in one place and
  text in another and those invert in opposite directions. A toggle shipped before
  that work would leave most workspaces unreadable, so it is deliberately not wired up.

See `docs/PRODUCT_SCOPE.md` and `docs/DATA_MODEL.md`.
