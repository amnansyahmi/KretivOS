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

The chatbot and every generator use a server-side OpenAI-compatible route for `ai-nonymauz-cloud`.

| Route | Produces |
| --- | --- |
| `/api/ai` | Kretiv AI chat replies |
| `/api/marketing/generate` | A ten-section marketing plan |
| `/api/storyboard/generate` | A shot-by-shot storyboard |
| `/api/prompt/generate` | A model-specific image or video prompt |
| `/api/funnels/generate` | A four-stage TOFU/MOFU/BOFU/retention funnel |

Each generator asks for a JSON object matching a fixed schema and falls back to a
deterministic starter when AI is unconfigured or unavailable, so no button is ever dead.
The response reports `source` as either `ai-nonymauz-cloud` or `starter`, and the UI says
which one produced the result.

```bash
cp .env.example .env.local
```

Configure:

```env
AI_NONYMAUZ_BASE_URL=https://your-host/v1
AI_NONYMAUZ_API_KEY=your-key
AI_NONYMAUZ_MODEL=your-model
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
