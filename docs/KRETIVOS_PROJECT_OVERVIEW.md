# KretivOS

> Internal Progressive Web App (PWA) for operating Kretivco from one connected workspace.

**Document status:** Living project overview  
**Last updated:** 31 July 2026  
**Repository:** `amnansyahmi/KretivOS`

---

## 1. Project Summary

KretivOS is Kretivco's internal company operating system.

The goal is to replace disconnected spreadsheets, documents, chat threads, folders, dashboards and manual workflows with one mobile-friendly PWA that the team can use every day.

KretivOS is intended to become the source of truth for:

- Customers and client workspaces
- CRM and sales opportunities
- Proposals, quotations, invoices, receipts and agreements
- Finance, settlements and projections
- Projects, tasks, delivery and approvals
- Marketing plans, funnels, content and storyboards
- Brand DNA, creative assets and reusable templates
- Knowledge, SOPs and business decisions
- Technology systems and deployments
- AI-assisted drafting, analysis and recommendations
- Cross-module automations

The long-term product goal is simple:

> Kretivco should be able to run its day-to-day operation from KretivOS without relying on multiple disconnected tools.

---

## 2. Why KretivOS Exists

Kretivco operates across marketing, creative production, software development, e-commerce, finance and client delivery.

Without a shared operating system, important information becomes fragmented across:

- WhatsApp and email
- Google Drive folders
- GitHub repositories
- Spreadsheets
- Proposals and PDFs
- Payment platforms
- Marketing platforms
- Personal notes and AI conversations

This creates several risks:

- Repeated data entry
- Missing client context
- Inconsistent documents
- Unclear ownership and status
- Manual commission and settlement calculations
- Knowledge being lost inside conversations
- Different team members using different versions of information
- AI generating content without approved brand or business context

KretivOS is designed to connect these records and workflows.

---

## 3. Product Principles

### 3.1 Customer-first data model

Business records must link back to an existing customer or internal workspace.

Examples:

- A funnel must belong to a customer.
- An invoice must belong to a customer.
- A project must belong to a customer.
- A brand must belong to a customer or company workspace.
- A settlement must belong to a customer agreement.

Free-text customer names should be avoided when a reusable customer record is available.

### 3.2 One customer can have multiple brands

A customer and a brand are not always the same thing.

Example:

```text
Customer: Chef Ammar
Brands:
- Chef Ammar Products
- Pizza Mania
- Future restaurant or product brands
```

Another example:

```text
Customer: Restu.ai
Brand:
- Restu.ai
```

Brand DNA, assets, campaigns and funnels should be linked to the correct brand, not hardcoded to one customer.

### 3.3 Evidence before AI

AI should not silently invent or overwrite approved business information.

The preferred workflow is:

```text
Evidence
→ AI suggestion
→ Human review
→ Approval
→ Approved company record
```

This applies to:

- Brand DNA
- Marketing strategy
- Funnel recommendations
- Financial interpretations
- Document drafting
- Customer insights

### 3.4 Shared internal workspace

KretivOS is currently intended for a small shared Kretivco team.

The interface should avoid unnecessary executive role switching. Permissions can still be introduced for sensitive actions, approvals and external client access.

### 3.5 Mobile-first PWA

The application should be fully usable on:

- Desktop browser
- Mobile browser
- Installed Android PWA
- Installed iPhone PWA
- Tablet

Important mobile requirements include:

- Large touch targets
- Responsive forms
- Bottom-sheet editors
- Safe-area support
- Offline app shell
- Clear mobile navigation
- No floating controls covering form actions

---

## 4. Intended Users

### Internal Kretivco team

Primary users who manage customers, sales, campaigns, projects, finances, documents and operations.

### Kretivco management

Uses company-level dashboards, projections, approvals, cash-flow information and AI summaries.

### Future client users

A later client portal may allow customers to:

- Review deliverables
- Approve documents
- View invoices and receipts
- Access selected reports
- Comment on campaigns
- Download approved assets

Client access is not the main priority for the current internal version.

---

## 5. Current Technology Direction

### Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui-inspired reusable components
- Mobile-first responsive layouts

### PWA

- Web app manifest
- Service worker
- Installable app shell
- Offline route caching
- Safe-area support

### AI

- `ai-nonymauz-cloud`
- OpenAI-compatible server-side API routes
- Environment-based model configuration

### Current persistence

- Browser `localStorage`

This is acceptable for an interactive prototype, but it is not suitable as the production system of record.

### Recommended production persistence

- PostgreSQL through Supabase, Neon or a managed PostgreSQL provider
- Prisma or Drizzle ORM
- Object storage through Cloudflare R2 or Supabase Storage
- Background worker for scheduled and long-running tasks

### Deployment

Recommended initial setup:

```text
Next.js PWA and normal APIs: Vercel
Database: PostgreSQL / Supabase
Files: Cloudflare R2 or Supabase Storage
DNS and edge security: Cloudflare
AI: ai-nonymauz-cloud
Long-running jobs: separate worker or queue service
```

---

## 6. Current Environment Variables

The current AI integration expects:

```env
AI_NONYMAUZ_BASE_URL=https://your-ai-host/v1
AI_NONYMAUZ_API_KEY=your-api-key
AI_NONYMAUZ_MODEL=your-model-name
```

Future production variables will likely include:

```env
DATABASE_URL=
AUTH_SECRET=
NEXT_PUBLIC_APP_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
ENCRYPTION_KEY=
CRON_SECRET=
```

Additional integration-specific variables should be added only when those integrations are implemented.

---

## 7. Functional Areas

## 7.1 Company Command Centre

Purpose:

- Show what requires attention today
- Show company and client health
- Surface revenue, approvals, risks and deadlines
- Provide quick actions
- Provide AI-generated business summaries

Current status:

- UI exists
- Some summary data is still seeded or locally calculated
- Requires database-backed analytics and activity feeds

---

## 7.2 Customer and Client Workspaces

Purpose:

- Maintain the master customer record
- Store contacts, billing data, agreements and workspace configuration
- Link all commercial, project, marketing and finance records
- Support multiple brands under one customer

Required customer fields include:

- Legal name
- Trading name
- Registration number
- Primary contact
- Email and phone
- Billing address
- Status
- Industry
- Notes
- Customer owner
- Brands
- Service engagements

Current status:

- Working browser-based CRUD has been introduced
- Shared database synchronization is not implemented
- Brand hierarchy still needs full implementation

---

## 7.3 Customer Onboarding

Purpose:

- Select a service blueprint
- Create the required workspace structure
- Generate tasks and documents
- Create project and commercial records
- Prepare kickoff and delivery requirements

Example blueprints:

- E-commerce and marketplace
- Corporate website
- Marketing retainer
- Branding
- AI product
- Custom software

Current status:

- Interactive onboarding flow exists
- Full server-side provisioning is not implemented
- External folder, repository and deployment creation remains future work

---

## 7.4 CRM and Pipeline

Purpose:

- Track leads and opportunities
- Store contact history
- Manage stages, probability, value and next action
- Convert a won opportunity into customer, sales and project records

Required workflow:

```text
Lead
→ Qualified
→ Proposal
→ Negotiation
→ Won or Lost
```

Current status:

- Browser-based CRUD exists
- Needs linked contacts, activities, reminders and conversion automation

---

## 7.5 Sales and Commercial Documents

Purpose:

- Create and manage proposals
- Create quotations
- Convert quotations to sales orders
- Generate invoices
- Mark payments
- Issue receipts and credit notes
- Store agreements and MoUs

Expected lifecycle:

```text
Proposal
→ Quotation
→ Sales Order
→ Invoice
→ Payment
→ Receipt
```

Current status:

- Basic linked records and templates exist
- Markdown document generation exists
- Production PDF generation, numbering, tax logic and immutable document snapshots are not complete

---

## 7.6 Finance

Purpose:

- Record income and expenses
- Track receivables and payables
- Show cash flow
- Track budgets and reimbursements
- Calculate customer profitability
- Support financial projections

Current status:

- Basic local ledger behavior exists
- Chef Ammar financial projection exists
- Full accounting controls are not implemented

Still required:

- Chart of accounts
- Categories and cost centres
- Bank reconciliation
- Tax and SST configuration
- Recurring entries
- Locked accounting periods
- Export for accountant
- Audit trail
- Multi-currency readiness if needed

---

## 7.7 Chef Ammar Financials and Settlements

Purpose:

- Track verified sales by channel
- Calculate management fee per unit
- Calculate approved advertising reimbursement
- Generate weekly statements
- Track Tuesday settlement
- Calculate monthly incentive
- Split company and team distribution
- Compare projection against actual results

Important design requirement:

Commercial rules must be versioned by agreement version and effective date.

The system must not overwrite historical statements when a new MoU changes:

- Sales targets
- Management fee
- Incentive tier
- Payment dates
- Channel coverage
- Team distribution

Current status:

- Projection and settlement calculators exist
- Full channel reconciliation, agreement versioning and immutable statement snapshots are not complete

---

## 7.8 Projects and Delivery

Purpose:

- Track projects, milestones and tasks
- Show progress and due dates
- Link project delivery to the originating quotation or agreement
- Support QA, deployment, training and warranty

Current status:

- Basic project CRUD and progress fields exist
- Kanban tasks, dependencies, comments, attachments and workload planning remain incomplete

---

## 7.9 Marketing Plans

Purpose:

- Create complete customer marketing strategies
- Store objectives, audience, positioning, message and KPI
- Connect strategy to funnels, content, media budget and reporting

Expected sections:

- Executive summary
- Market diagnosis
- SWOT
- Customer personas
- Customer journey
- Positioning
- Messaging
- Channel strategy
- Funnel strategy
- Content pillars
- Media budget
- Timeline
- KPI and reporting

Current status:

- Visual plan example exists
- Full CRUD and AI-assisted strategy workflow still requires development

---

## 7.10 Funnel Library

Purpose:

- Store all customer funnels
- Require an existing customer before saving a production funnel
- Link funnels to a brand
- Link activities to approved marketing channels
- Support TOFU, MOFU, BOFU and retention stages
- Allow AI generation through `ai-nonymauz-cloud`

Current working capabilities include:

- Funnel list
- Customer labels
- Search and filters
- Example funnels
- Add, edit and delete funnels
- Add, edit and delete funnel activities
- AI funnel generation
- Mobile-friendly funnel details

Still required:

- Customer master selection instead of free text everywhere
- Brand selection
- Marketing channel master records
- Funnel Sandbox for experiments
- Reusable funnel framework library
- Content-template chooser for Add Content
- Funnel performance metrics and attribution
- Versioning and approval

---

## 7.11 Funnel Sandbox

Purpose:

- Test a funnel without assigning it to a live customer
- Compare frameworks
- Use AI to propose a structure
- Promote an approved sandbox funnel into a customer workspace

Suggested workflow:

```text
Choose industry and objective
→ Choose funnel framework
→ Choose available channels
→ Generate or build funnel
→ Test and edit
→ Save as reusable template
or
→ Promote to customer funnel
```

Current status:

- Not yet fully implemented

---

## 7.12 Funnel and Marketing Playbook Library

Purpose:

Store reusable funnel knowledge in Markdown so KretivOS and AI can recommend a suitable approach instead of generating strategy without a reference model.

The library should include frameworks such as:

- AIDA
- TOFU / MOFU / BOFU
- See-Think-Do-Care
- Awareness-Consideration-Conversion-Retention
- Product launch funnel
- Lead generation funnel
- Webinar funnel
- E-commerce conversion funnel
- Restaurant visit funnel
- Marketplace product funnel
- Local service funnel
- B2B sales funnel
- SaaS onboarding funnel
- Subscription funnel
- Referral funnel
- Re-engagement funnel
- Event registration funnel
- Community growth funnel

Each Markdown entry should define:

- Best use cases
- Customer type
- Buying cycle
- Required channels
- Funnel stages
- Typical content
- KPIs
- Risks
- Example application

Current status:

- Full playbook file set is still required

---

## 7.13 Content Planner

Purpose:

- Plan content by customer, brand, campaign and funnel stage
- Assign platform, format, owner, due date and status
- Support approval and publishing
- Store post-performance data

Current status:

- Calendar-style interface exists
- Full CRUD, publishing integration and analytics ingestion are not complete

---

## 7.14 Storyboard Studio

Purpose:

- Create video concepts and scenes
- Store script, shot, duration, camera, audio, talent, props and edit notes
- Link storyboard scenes to funnel activities and content records
- Generate AI image and video prompts

Current status:

- Example storyboard interface exists
- Full CRUD, scene reordering, file attachment and approval are incomplete

---

## 7.15 Prompt Lab

Purpose:

- Generate model-specific prompts
- Use approved customer, brand, product and storyboard context
- Preserve product identity
- Save prompt history and output references

Target models may include:

- GPT Image
- Kling
- Veo
- Runway
- Flux
- Midjourney

Current status:

- Prompt interface exists
- Full saved history, reusable prompt templates and output asset linking are incomplete

---

## 7.16 Brand DNA and Assets

Purpose:

- Maintain brand identity per brand
- Store logos, colours, typography, voice, positioning, claims and visual rules
- Store approved assets
- Provide trusted context to AI and document generation

Required hierarchy:

```text
Customer
→ Brand
→ Brand DNA versions
→ Assets
→ Campaigns and content
```

Brand DNA should include:

- Brand name
- Parent customer
- Brand description
- Audience
- Positioning
- Value proposition
- Personality
- Tone of voice
- Preferred words
- Avoided words
- Core messages
- Approved claims
- Restricted claims
- Colour palette
- Typography
- Photography direction
- Layout direction
- Logo rules
- Product facts
- Competitors
- Examples of approved content
- Completeness score
- Approval status
- Version history

Recommended AI workflow:

```text
Customer data + uploaded knowledge + approved examples
→ AI analyses evidence
→ AI suggests missing Brand DNA fields
→ User compares suggestion against current values
→ User applies, edits or rejects each suggestion
→ Approved Brand DNA version is published
```

Current status:

- Static Chef Ammar example exists
- Multi-customer and multi-brand CRUD is still required
- AI suggestion and approval workflow is not yet complete
- Real asset storage is not yet connected

---

## 7.17 Knowledge Library

Purpose:

- Store company and customer knowledge
- Accept Markdown files
- Search titles and content
- Provide selected context to AI
- Preserve operational decisions and SOPs

Current working capabilities include:

- Add knowledge
- Upload `.md`
- Markdown editor
- Markdown preview
- Search and filter
- Edit and delete
- Download Markdown
- Ask AI using selected knowledge context

Still required:

- Database persistence
- Embeddings and semantic search
- Chunking and retrieval
- Source citations inside AI answers
- Version history
- File ingestion beyond Markdown
- Access permissions

---

## 7.18 Templates and Document Engine

Purpose:

- Store reusable company templates
- Detect variables such as `{{client_name}}`
- Generate documents from linked business records
- Keep branding and business logic consistent

Current working capabilities include:

- Add, edit and delete templates
- Markdown content
- Variable detection
- Generate document preview
- Save generated output
- Download Markdown

Still required:

- HTML and PDF rendering
- Letterhead layout engine
- Page numbering and signatures
- Document numbering service
- Version snapshots
- Approval workflow
- Email delivery
- Cloud storage

---

## 7.19 Automations

Purpose:

- Trigger cross-module actions based on business events
- Keep human approval for sensitive actions
- Track execution history

Example:

```text
Invoice marked paid
→ Create receipt
→ Update finance ledger
→ Update project status
→ Notify customer workspace
```

Current working capabilities include:

- Add, edit and delete automation definitions
- Add and remove actions
- Activate or pause
- Manual run
- Local execution history

Current limitation:

- Actions are simulated locally
- Real integrations and background execution are not implemented

Still required:

- Durable job queue
- Retry policy
- Idempotency
- Failure handling
- Secrets management
- Scheduled triggers
- Webhook triggers
- Real connector actions
- Execution logs and alerts

---

## 7.20 Technology Workspace

Purpose:

- Track repositories, domains, environments, deployments, APIs, incidents and AI services
- Connect customer systems to projects and owners

Current status:

- Static inventory interface exists
- Real GitHub, Vercel, Cloudflare and monitoring integrations are not complete

---

## 7.21 Approvals

Purpose:

- Provide one shared decision queue
- Support approve, reject, comments and version context
- Keep an audit history

Current status:

- Basic local approve interaction exists
- Production approval policies, comments, signatures and audit records are not complete

---

## 7.22 Global Search and Command Palette

Purpose:

Search across:

- Customers
- Contacts
- Opportunities
- Documents
- Invoices
- Projects
- Knowledge
- Funnels
- Content
- Brand assets
- Technology systems

Current status:

- Visual search control exists
- Unified search index and command actions are not implemented

---

## 8. What Is Currently Working

The following capabilities are interactive in the current PWA prototype:

- Installable PWA shell
- Responsive desktop and mobile layouts
- `ai-nonymauz-cloud` chat route
- Funnel CRUD
- Funnel activity CRUD
- AI funnel generation
- Knowledge Markdown upload and editing
- Knowledge search and filtering
- Knowledge AI question flow
- Automation definition CRUD and local runs
- Template CRUD and Markdown document generation
- Basic customer and business-record CRUD
- CRM opportunity records
- Basic sales records
- Basic finance transactions
- Basic settlement calculations
- Basic project and onboarding records
- Chef Ammar projection calculations
- Local persistence after refresh
- Offline app-shell caching

---

## 9. What Is Prototype-only

The following should not yet be treated as production-grade:

- `localStorage` as the main data store
- Cross-device synchronization
- Team collaboration
- Authentication and sessions
- Permissions
- Sensitive-data protection
- Real asset uploads
- External automation actions
- Financial accounting controls
- Immutable documents and statements
- Production PDF generation
- Audit trails
- Backups
- Data migration
- Monitoring and alerts
- Integration credential management

---

## 10. Critical Development Still Required

## Priority 0 — Production foundation

These items are required before KretivOS becomes a trusted shared internal system:

1. PostgreSQL database
2. Database migrations and seed strategy
3. Authentication
4. User and team-member records
5. Permissions for sensitive actions
6. Server-side CRUD APIs or server actions
7. Object storage for assets and documents
8. Audit log
9. Version history
10. Automated backups
11. Error monitoring
12. Production logging
13. Data import from current browser storage
14. Secure secrets management
15. Rate limiting and input validation

## Priority 1 — Connected operating model

1. Customer master
2. Contact master
3. Multi-brand hierarchy
4. Marketing channel master
5. Brand DNA CRUD and versioning
6. AI Brand DNA suggestion and approval
7. Funnel Sandbox
8. Funnel framework Markdown library
9. Content-template library
10. Real marketing plan CRUD
11. Real content planner CRUD
12. Real storyboard CRUD
13. File and asset management
14. Linked comments, attachments and mentions
15. Global search
16. Notifications and activity feed

## Priority 2 — Commercial and finance maturity

1. Document numbering
2. Quotation line items and pricing rules
3. Tax and discount handling
4. Invoice payment allocation
5. Receivable and payable aging
6. Bank and payment references
7. Agreement-versioned settlement engine
8. Marketplace reconciliation
9. Monthly incentive engine
10. Projection versus actual reporting
11. PDF invoices, receipts, proposals and statements
12. Approval before commercial document issue
13. Financial period locking
14. Export for accountant

## Priority 3 — Delivery and automation

1. Task-level project management
2. Kanban and timeline
3. Dependencies and recurring tasks
4. QA and deployment checklists
5. Background job queue
6. Scheduled automation
7. Webhook automation
8. Retry and failure management
9. Gmail and Calendar actions
10. Drive folder and file actions
11. GitHub repository and issue actions
12. Vercel and Cloudflare deployment visibility
13. Customer notification delivery

## Priority 4 — Analytics and intelligence

1. Company dashboard from live records
2. Customer health score
3. Sales conversion analysis
4. Project profitability
5. Funnel performance
6. Content performance
7. Marketing attribution
8. Cash-flow forecast
9. AI morning brief
10. Risk and anomaly alerts
11. Searchable decision history
12. AI answers with record-level citations

---

## 11. Recommended Core Data Model

The production database should contain at least the following domains.

### Identity and access

- Users
- Team members
- Sessions
- Permissions
- Client-portal users

### Customers and brands

- Customers
- Contacts
- Brands
- Brand DNA
- Brand DNA versions
- Brand assets
- Customer notes
- Customer activities

### Commercial

- Leads
- Opportunities
- Proposals
- Quotations
- Quotation items
- Sales orders
- Invoices
- Invoice items
- Payments
- Receipts
- Credit notes
- Agreements
- Agreement versions

### Finance

- Accounts
- Transactions
- Categories
- Cost centres
- Budgets
- Reimbursements
- Receivables
- Payables
- Financial periods
- Projections
- Projection scenarios

### Chef Ammar and settlement

- Sales channels
- Channel sales imports
- Weekly statements
- Settlement items
- Advertising reimbursements
- Incentive calculations
- Team distributions
- Contract rules
- Contract-rule versions

### Delivery

- Projects
- Milestones
- Tasks
- Dependencies
- Comments
- Attachments
- QA checks
- Deployments
- Incidents

### Marketing and creative

- Marketing plans
- Campaigns
- Funnels
- Funnel versions
- Funnel stages
- Funnel activities
- Funnel frameworks
- Marketing channels
- Content templates
- Content items
- Publishing records
- Performance metrics
- Storyboards
- Storyboard scenes
- Prompt templates
- Prompt runs

### Knowledge and documents

- Knowledge entries
- Knowledge versions
- Knowledge chunks
- Embeddings
- Templates
- Template versions
- Generated documents
- Document versions
- Approval requests
- Approval decisions

### Automation and platform

- Automation definitions
- Automation triggers
- Automation actions
- Automation runs
- Notifications
- Audit events
- Integration connections
- Integration secrets references

---

## 12. Security Requirements

Before storing real business and customer data, KretivOS should implement:

- Secure authentication
- Server-side authorization
- Encrypted secrets
- Least-privilege integration tokens
- Input validation
- File-type and file-size validation
- Malware scanning for uploads where appropriate
- Audit logs for sensitive changes
- Backup and recovery process
- Session expiration
- Protection against cross-site scripting and request forgery
- Rate limiting for AI and public endpoints
- Separation between internal and client-visible records
- Data-retention policy
- Production environment separation

No private API key should be exposed through a `NEXT_PUBLIC_` environment variable.

---

## 13. PWA Requirements Still Needed

The current PWA shell works, but production offline support should include:

- Clear offline indicator
- Queued writes while offline
- Conflict resolution
- Background synchronization
- Cache version strategy
- User-controlled cache clear
- Offline-safe file behavior
- Install instructions for iPhone and Android
- Push notifications if required
- Tested safe-area layouts
- Tested accessibility and keyboard navigation

---

## 14. Recommended Development Roadmap

## Phase 1 — Shared foundation

- PostgreSQL database
- Authentication
- Customer master
- Brand hierarchy
- Shared server-side CRUD
- File storage
- Audit log
- Browser-data migration

**Exit condition:** Two team members can sign in from different devices and see the same customer records.

## Phase 2 — Commercial operations

- CRM
- Proposal and quotation lifecycle
- Invoice, payment and receipt lifecycle
- Finance ledger
- Agreement versioning
- Chef Ammar settlement engine
- PDF documents

**Exit condition:** Kretivco can manage one real customer from lead through payment and settlement.

## Phase 3 — Marketing operating system

- Brand DNA
- AI Brand DNA suggestions
- Marketing plans
- Funnel Sandbox
- Funnel playbook library
- Channel master
- Content templates
- Content planner
- Storyboard Studio

**Exit condition:** A customer campaign can be planned, approved and moved into production entirely inside KretivOS.

## Phase 4 — Delivery and automation

- Projects and task management
- Approvals
- Notifications
- Background workers
- Integration actions
- Automated onboarding
- Scheduled settlement and reporting

**Exit condition:** Repeated operational work is executed from reliable workflows instead of manual checklists.

## Phase 5 — Analytics and client portal

- Live dashboards
- Marketing and funnel analytics
- Customer health
- Profitability
- AI executive brief
- Client portal

**Exit condition:** Management and selected customers can view trusted, permission-controlled information without manual report preparation.

---

## 15. Suggested Immediate Next Sprint

The next sprint should focus on shared data and the customer-brand foundation instead of adding more disconnected screens.

Recommended sprint scope:

1. Add PostgreSQL and ORM
2. Add authentication
3. Create customer and contact tables
4. Create brand and Brand DNA tables
5. Migrate existing sample customers
6. Replace customer textboxes with customer selectors
7. Add marketing-channel master table
8. Add reusable content-template table
9. Build multi-brand Brand DNA page
10. Add AI Brand DNA suggestion endpoint with approval
11. Migrate Funnel Library from `localStorage` to database
12. Add Funnel Sandbox and promotion to a real customer
13. Add audit events for create, edit and delete
14. Verify mobile behavior and Vercel production build

---

## 16. Definition of Done for Production v1

KretivOS v1 should not be considered production-ready until:

- Users can authenticate securely
- Shared data works across devices
- All major records are database-backed
- Customers and brands are reusable master records
- Create, edit and delete operations are permission-controlled
- Critical changes are audited
- Files are stored in managed object storage
- Commercial documents have immutable versions
- Chef Ammar settlements preserve historical contract rules
- Backups and restoration are tested
- AI uses approved context and provides traceable sources
- Mobile flows are tested on Android and iPhone
- Critical modules have automated tests
- Production errors are monitored
- No major navigation item leads only to a non-working placeholder

---

## 17. Current Non-goals

The following are not immediate priorities unless Kretivco changes scope:

- Full HR management
- Payroll processing
- Attendance tracking
- Public SaaS multi-tenancy
- Complex enterprise procurement
- Full accounting-system replacement
- Native iOS or Android applications

KretivOS should first become a reliable internal PWA for Kretivco operations.

---

## 18. Final Product Vision

KretivOS should become the application Kretivco opens every morning to understand:

- What needs attention
- Which customer needs action
- What must be approved
- What should be created
- What is due for payment
- What is delayed
- Which campaign is performing
- What the team should do next

The final system should connect business context, operational records, creative production, financial control and AI assistance without allowing AI to replace approval or authoritative company data.
