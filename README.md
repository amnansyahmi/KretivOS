# KretivOS PWA

A shared internal operating system for Kretivco Mediaworks. This build replaces the earlier role-switching prototype with one collaborative workspace for the small Kretivco team.

## Implemented workspaces

- Company Command Centre
- Client Workspaces
- Automated Customer Onboarding
- CRM and Pipeline
- Sales and Document Lifecycle
- Finance and Cash Outlook
- Chef Ammar 12-Month Financial Projection
- Weekly Tuesday Settlement
- Projects and Delivery
- Marketing Plan Builder
- TOFU / MOFU / BOFU Funnel Builder
- Content Planner
- Storyboard Studio
- AI Prompt Lab
- Brand DNA and Asset Library
- Technology Workspace
- Knowledge Search Interface
- Shared Approval Queue
- Automation Builder
- Reusable Templates
- PWA and AI Settings

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

The chatbot uses a server-side OpenAI-compatible route for `ai-nonymauz-cloud`.

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

This package is a comprehensive interactive product prototype and PWA shell. Before using it as the company system of record, connect:

- PostgreSQL database and migrations
- Authentication and session handling
- Object storage for files
- Server-side document/PDF generation
- Audit-event persistence
- Scheduled workers for Tuesday and monthly settlements
- Live integrations for Google, GitHub, payment, marketplace and advertising platforms
- Automated tests and deployment pipeline

See `docs/PRODUCT_SCOPE.md` and `docs/DATA_MODEL.md`.
