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
| Reusable Templates | `/templates` |

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
- Shared Approval Queue — open sales documents, settlements and HR leave in one queue
- Chef Ammar 12-Month Financial Projection — an editable scenario model, deliberately separate from actual sales
- Marketing Plan Builder, Storyboard Studio, AI Prompt Lab — AI generation backed by `/api/*/generate`
- Content Planner — weekly plan held in local storage
- Technology — static system inventory plus a live database health check
- Settings — opens the workspace that owns each setting

## PWA capabilities

- Web app manifest
- Installable home-screen experience
- Standalone display mode
- Service worker with app-shell caching
- Responsive mobile navigation
- Safe-area compatible viewport
- Local persistence for active view, onboarding progress, approvals and financial scenario inputs
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
| `/api/ai/status` | Live Render health, model, RAG and image capability status |
| `/api/ai/studio` | Shared AI conversations, prompt templates, outputs, feedback and usage |
| `/api/ai/image` | Pollinations Flux image generation through ai-nonymauz-cloud |

### Kretiv AI Studio

`/ai-studio` exposes the capabilities already deployed on Render without replacing the existing chatbot:

- fast, normal and deep reasoning modes with optional explicit model selection
- live KretivOS business and customer context
- the cloud service's BM25 RAG knowledge and web/weather tools
- shared Neon-backed conversation history, saved outputs, feedback and token telemetry
- reusable executive, client, sales, marketing, research and content prompts
- image generation using the deployed Pollinations Flux endpoint

Apply `db/migrations/0004_ai_studio.sql` to Neon before opening the shared history workspace.

### Grounding

`lib/ai-context.ts` supplies AI features with real records instead of leaving them
to guess. It provides two things:

- **Knowledge retrieval** — ranked full-text search over `knowledge_entries` using
  the GIN index defined in the first migration. Terms are OR-ed rather than AND-ed:
  a natural-language question nearly always contains a word the document does not
  use ("payment" against a document saying "payable"), and under AND that returns
  nothing at all. `ts_rank` still orders by match quality, and an ILIKE keyword scan
  covers anything the English dictionary stems awkwardly.
- **An operations snapshot** — pipeline, receivables, settlements, delivery and
  cleared cash rolled up from the shared tables, plus a list of concrete items
  needing attention.

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

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production foundation still required

The commercial record set now runs on Neon PostgreSQL with audit-log writes. Before
using KretivOS as the company system of record, still connect:

- **Authentication and session handling.** Every API route is currently unauthenticated
  and every write is attributed to a single hardcoded organisation, so audit entries
  cannot identify who made a change.
- Object storage for files
- Server-side document/PDF generation
- Scheduled workers for Tuesday and monthly settlements
- Live integrations for Google, GitHub, payment, marketplace and advertising platforms
- Automated tests, linting and a deployment pipeline

Content Planner entries and the financial projection inputs are still browser-local and
are not shared between team members.

See `docs/PRODUCT_SCOPE.md` and `docs/DATA_MODEL.md`.
