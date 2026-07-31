export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "url" | "email" | "progress";

export type WorkspaceField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type WorkspaceRecord = {
  id: string;
  title: string;
  client: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: string | number;
};

export type WorkspaceConfig = {
  slug: string;
  eyebrow: string;
  title: string;
  singular: string;
  description: string;
  statuses: string[];
  fields: WorkspaceField[];
  starterRecords: WorkspaceRecord[];
  aiInstruction: string;
  amountField?: string;
  progressField?: string;
  quickActions?: string[];
};

const now = "2026-07-31T02:30:00.000Z";
const record = (id: string, title: string, client: string, status: string, extra: Record<string, string | number> = {}): WorkspaceRecord => ({ id, title, client, status, createdAt: now, updatedAt: now, ...extra });

export const workspaceConfigs: Record<string, WorkspaceConfig> = {
  clients: {
    slug: "clients",
    eyebrow: "Connected agency accounts",
    title: "Client Workspaces",
    singular: "client workspace",
    description: "Create and maintain each client’s commercial, delivery, marketing, finance and knowledge context from one shared record.",
    statuses: ["Onboarding", "Active", "At risk", "Paused", "Completed"],
    fields: [
      { key: "company", label: "Company / brand", type: "text", required: true },
      { key: "contact", label: "Primary contact", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "service", label: "Service / engagement", type: "text" },
      { key: "commercialValue", label: "Commercial value (RM)", type: "number" },
      { key: "progress", label: "Readiness / progress", type: "progress" },
      { key: "nextAction", label: "Next action", type: "textarea" },
      { key: "notes", label: "Business DNA / notes", type: "textarea" },
    ],
    starterRecords: [
      record("client-chef-ammar", "Chef Ammar", "Chef Ammar", "Onboarding", { company: "Chef Ammar", contact: "Chef Ammar Al Ali", email: "chefammarproduct@gmail.com", service: "Sole distributor, marketplace and growth", commercialValue: 722700, progress: 68, nextAction: "Complete payment gateway KYC and sales launch", notes: "Warm, authentic Middle Eastern food brand. Main channels: Sales Page, Shopee and TikTok Shop." }),
      record("client-smart-selangor", "Smart Selangor", "Smart Selangor", "Active", { company: "Smart Selangor", service: "Corporate website revamp", commercialValue: 29000, progress: 42, nextAction: "Approve information architecture", notes: "Corporate public-sector visual direction. Avoid generic SaaS styling." }),
      record("client-restu", "Restu.ai", "Restu.ai", "Active", { company: "Restu.ai", service: "AI wedding PWA", commercialValue: 0, progress: 61, nextAction: "Release vendor discovery", notes: "Malaysia and Singapore wedding-planning platform." }),
    ],
    aiInstruction: "Create a concise client Business DNA, onboarding risk list and recommended next actions based on the supplied engagement details.",
    amountField: "commercialValue",
    progressField: "progress",
  },
  onboarding: {
    slug: "onboarding",
    eyebrow: "Repeatable delivery setup",
    title: "Customer Onboarding",
    singular: "onboarding",
    description: "Track every new client from data collection through documentation, provisioning, kickoff and operational readiness.",
    statuses: ["Draft", "Collecting info", "Documents", "Provisioning", "Ready", "Completed"],
    fields: [
      { key: "service", label: "Service blueprint", type: "select", required: true, options: ["E-commerce & Marketplace", "Corporate Website", "AI Product", "Marketing Retainer", "Branding", "Custom Software"] },
      { key: "contact", label: "Primary contact", type: "text" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "launchDate", label: "Target launch", type: "date" },
      { key: "commercialValue", label: "Commercial value (RM)", type: "number" },
      { key: "progress", label: "Onboarding progress", type: "progress" },
      { key: "requiredDocuments", label: "Documents to create", type: "textarea", placeholder: "Proposal, quotation, agreement, NDA, project brief..." },
      { key: "provisioning", label: "Provisioning checklist", type: "textarea", placeholder: "Workspace, folders, project, repository, brand library..." },
      { key: "notes", label: "Notes / blockers", type: "textarea" },
    ],
    starterRecords: [record("onboard-ca", "Chef Ammar full operation", "Chef Ammar", "Provisioning", { service: "E-commerce & Marketplace", contact: "Chef Ammar Al Ali", startDate: "2026-08-01", launchDate: "2026-09-01", commercialValue: 722700, progress: 68, requiredDocuments: "MoU, sales projection, weekly statement, invoice, project brief, marketing plan, SOP", provisioning: "Client workspace, CAMS, payment gateway, sales page, marketplace access, content calendar", notes: "Payment gateway KYC remains the critical path." })],
    aiInstruction: "Build a complete onboarding checklist including documents, accounts, technical provisioning, meetings, approvals, risks and launch readiness for this service.",
    amountField: "commercialValue",
    progressField: "progress",
    quickActions: ["Mark ready", "Generate documentation checklist"],
  },
  crm: {
    slug: "crm",
    eyebrow: "Commercial pipeline",
    title: "CRM & Opportunities",
    singular: "opportunity",
    description: "Manage leads, contacts, meetings, follow-ups, proposals, value and probability without relying on spreadsheets.",
    statuses: ["New lead", "Qualified", "Discovery", "Proposal", "Negotiation", "Won", "Lost"],
    fields: [
      { key: "contact", label: "Contact person", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "service", label: "Opportunity / service", type: "text", required: true },
      { key: "value", label: "Estimated value (RM)", type: "number" },
      { key: "probability", label: "Probability", type: "progress" },
      { key: "nextFollowUp", label: "Next follow-up", type: "date" },
      { key: "source", label: "Lead source", type: "select", options: ["Referral", "Website", "Threads", "Social media", "Tender", "Existing client", "Other"] },
      { key: "notes", label: "Meeting notes / objections", type: "textarea" },
    ],
    starterRecords: [
      record("crm-selangor", "Smart Selangor phase 2", "Smart Selangor", "Proposal", { service: "Website phase 2", value: 58000, probability: 55, nextFollowUp: "2026-08-05", source: "Existing client", notes: "Awaiting scope clarification." }),
      record("crm-fnb", "Local F&B chain growth system", "Local F&B Chain", "Qualified", { service: "Marketplace and marketing", value: 42500, probability: 35, nextFollowUp: "2026-08-03", source: "Referral", notes: "Needs sales dashboard and content production." }),
    ],
    aiInstruction: "Prepare opportunity qualification notes, discovery questions, likely objections, recommended next action and a concise follow-up message.",
    amountField: "value",
    progressField: "probability",
    quickActions: ["Move to proposal", "Mark won"],
  },
  sales: {
    slug: "sales",
    eyebrow: "Commercial document lifecycle",
    title: "Sales & Documents",
    singular: "document",
    description: "Create, edit and progress proposals, quotations, sales orders, invoices, receipts, credit notes and memos.",
    statuses: ["Draft", "Review", "Approved", "Sent", "Accepted", "Due", "Paid", "Cancelled"],
    fields: [
      { key: "documentType", label: "Document type", type: "select", required: true, options: ["Proposal", "Quotation", "Sales Order", "Invoice", "Receipt", "Credit Note", "Memo", "Agreement", "MoU"] },
      { key: "reference", label: "Reference number", type: "text", required: true },
      { key: "issueDate", label: "Issue date", type: "date" },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "value", label: "Value (RM)", type: "number" },
      { key: "paymentTerms", label: "Payment terms", type: "text" },
      { key: "scope", label: "Scope / line items", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    starterRecords: [
      record("doc-pizza", "Pizza Mania August Campaign", "Chef Ammar", "Approved", { documentType: "Proposal", reference: "KM/CA/2026/P001", issueDate: "2026-07-24", dueDate: "2026-07-31", value: 3500, paymentTerms: "Monthly", scope: "Strategy, design, Meta Ads management and reporting." }),
      record("doc-smart", "Smart Selangor Website Revamp", "Smart Selangor", "Sent", { documentType: "Quotation", reference: "QT-2026-0047", issueDate: "2026-07-25", dueDate: "2026-08-08", value: 29000, paymentTerms: "50% deposit, 50% completion", scope: "Corporate website design and development." }),
      record("doc-settlement", "Chef Ammar Weekly Management Fee", "Chef Ammar", "Due", { documentType: "Invoice", reference: "INV-2026-0082", issueDate: "2026-07-28", dueDate: "2026-08-04", value: 15000, paymentTerms: "Payable Tuesday", scope: "7,500 verified units × RM2." }),
    ],
    aiInstruction: "Draft professional Malaysian business document content for the selected document type using the supplied scope, value and payment terms. Include structured sections and clear next steps.",
    amountField: "value",
    quickActions: ["Create next document", "Mark paid"],
  },
  finance: {
    slug: "finance",
    eyebrow: "Shared company ledger",
    title: "Finance Ledger",
    singular: "transaction",
    description: "Record income, expenses, receivables, payables, reimbursements and internal allocations with searchable client context.",
    statuses: ["Planned", "Pending", "Due", "Paid", "Received", "Overdue", "Void"],
    fields: [
      { key: "transactionType", label: "Transaction type", type: "select", required: true, options: ["Income", "Expense", "Receivable", "Payable", "Advertising Reimbursement", "Team Distribution", "Company Allocation"] },
      { key: "reference", label: "Reference", type: "text" },
      { key: "transactionDate", label: "Transaction date", type: "date" },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "amount", label: "Amount (RM)", type: "number", required: true },
      { key: "category", label: "Category", type: "text" },
      { key: "account", label: "Account / method", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    starterRecords: [
      record("fin-ca-week", "Chef Ammar management fee", "Chef Ammar", "Due", { transactionType: "Receivable", reference: "INV-2026-0082", transactionDate: "2026-07-28", dueDate: "2026-08-04", amount: 15000, category: "Management fee", account: "Bank transfer" }),
      record("fin-pizza", "Pizza Mania campaign management", "Chef Ammar", "Received", { transactionType: "Income", reference: "KM/CA/2026/P001", transactionDate: "2026-07-31", amount: 1500, category: "Marketing retainer", account: "Business bank" }),
      record("fin-ad", "Meta Ads pre-funding", "Chef Ammar", "Pending", { transactionType: "Advertising Reimbursement", reference: "ADS-2026-W31", transactionDate: "2026-07-31", dueDate: "2026-08-04", amount: 4200, category: "Advertising", account: "Corporate card" }),
    ],
    aiInstruction: "Analyse this financial transaction, flag cashflow or collection risks, suggest the correct category and provide the next finance action.",
    amountField: "amount",
    quickActions: ["Mark received", "Mark overdue"],
  },
  settlements: {
    slug: "settlements",
    eyebrow: "Weekly and monthly settlement cycle",
    title: "Settlements",
    singular: "settlement",
    description: "Track verified sales periods, management fees, advertising reimbursements, performance incentives, invoices and receipts.",
    statuses: ["Draft", "Awaiting data", "Verification", "Verified", "Invoiced", "Paid"],
    fields: [
      { key: "periodStart", label: "Period start", type: "date" },
      { key: "periodEnd", label: "Period end", type: "date" },
      { key: "units", label: "Verified units", type: "number" },
      { key: "feeRate", label: "Management fee / unit (RM)", type: "number" },
      { key: "advertising", label: "Advertising reimbursement (RM)", type: "number" },
      { key: "incentive", label: "Performance incentive (RM)", type: "number" },
      { key: "amount", label: "Total payable (RM)", type: "number" },
      { key: "reference", label: "Statement / invoice reference", type: "text" },
      { key: "notes", label: "Channel breakdown / verification notes", type: "textarea" },
    ],
    starterRecords: [record("settle-w31", "Weekly Statement W31", "Chef Ammar", "Verification", { periodStart: "2026-07-20", periodEnd: "2026-07-26", units: 7500, feeRate: 2, advertising: 4200, incentive: 0, amount: 19200, reference: "WS-2026-031", notes: "Sales Page 4,120 · Shopee 1,940 · TikTok 1,440" })],
    aiInstruction: "Review the settlement inputs, explain the calculation, identify missing verification evidence and draft a professional payment summary.",
    amountField: "amount",
    quickActions: ["Verify", "Create invoice", "Mark paid"],
  },
  projects: {
    slug: "projects",
    eyebrow: "Delivery control",
    title: "Projects & Delivery",
    singular: "project",
    description: "Manage delivery status, milestones, progress, due dates, owners, risks, quality checks and launch readiness.",
    statuses: ["Planning", "Active", "Review", "At risk", "Blocked", "Completed"],
    fields: [
      { key: "service", label: "Project / service type", type: "text" },
      { key: "owner", label: "Owner", type: "text" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "budget", label: "Budget / value (RM)", type: "number" },
      { key: "progress", label: "Progress", type: "progress" },
      { key: "milestones", label: "Milestones", type: "textarea" },
      { key: "risks", label: "Risks / blockers", type: "textarea" },
      { key: "nextAction", label: "Next action", type: "textarea" },
    ],
    starterRecords: [
      record("proj-ca", "Chef Ammar Marketplace", "Chef Ammar", "At risk", { service: "Marketplace and operational system", owner: "Kretivco Team", startDate: "2026-07-17", dueDate: "2026-09-01", budget: 722700, progress: 68, milestones: "Payment gateway · Sales page · CAMS · Marketing launch", risks: "KYC and final product information", nextAction: "Complete payment gateway KYC" }),
      record("proj-smart", "Smart Selangor Revamp", "Smart Selangor", "Active", { service: "Corporate website", owner: "Amnan", startDate: "2026-07-20", dueDate: "2026-09-30", budget: 29000, progress: 42, milestones: "IA · UI design · WordPress build · QA · Launch", risks: "Content readiness", nextAction: "Approve information architecture" }),
      record("proj-restu", "Restu.ai PWA", "Restu.ai", "Active", { service: "AI PWA", owner: "Kretivco Tech", startDate: "2026-07-06", dueDate: "2026-08-07", budget: 0, progress: 61, milestones: "Checklist · AI chat · Vendor discovery · Payment", risks: "Release timeline", nextAction: "Ship vendor discovery" }),
    ],
    aiInstruction: "Create a practical delivery plan with milestones, risks, dependencies, acceptance criteria and the next seven actions for this project.",
    amountField: "budget",
    progressField: "progress",
    quickActions: ["Update progress", "Mark completed"],
  },
  "marketing-plans": {
    slug: "marketing-plans",
    eyebrow: "AI Marketing Studio",
    title: "Marketing Plans",
    singular: "marketing plan",
    description: "Create and maintain strategy, audiences, positioning, channels, budget, funnel, KPIs and reporting for every client campaign.",
    statuses: ["Draft", "Research", "Review", "Approved", "Live", "Completed"],
    fields: [
      { key: "campaign", label: "Campaign", type: "text", required: true },
      { key: "objective", label: "Primary objective", type: "textarea", required: true },
      { key: "audience", label: "Target audience", type: "textarea" },
      { key: "offer", label: "Offer / proposition", type: "textarea" },
      { key: "channels", label: "Channels", type: "text" },
      { key: "budget", label: "Media / campaign budget (RM)", type: "number" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "endDate", label: "End date", type: "date" },
      { key: "kpis", label: "KPIs", type: "textarea" },
      { key: "strategy", label: "Strategy / content pillars", type: "textarea" },
    ],
    starterRecords: [record("plan-pizza", "Pizza Mania · August 2026", "Chef Ammar", "Approved", { campaign: "Pizza Mania launch", objective: "Bring new customers into Chef Ammar USJ 4 and increase table spend.", audience: "Residents around Subang and USJ", offer: "Wagyu Pizza launch offer", channels: "Meta Ads, Instagram, TikTok, Threads", budget: 2000, startDate: "2026-08-01", endDate: "2026-08-31", kpis: "Unique reach, offer redemption, restaurant visits, additional table orders", strategy: "Introduction → Trust → Urgency. Fix digital location information before paid media." })],
    aiInstruction: "Generate a complete agency-grade marketing plan: diagnosis, objectives, personas, positioning, TOFU/MOFU/BOFU, content pillars, channel plan, media budget, timeline, KPIs and reporting cadence.",
    amountField: "budget",
    quickActions: ["Generate funnel", "Mark live"],
  },
  content: {
    slug: "content",
    eyebrow: "Publishing operation",
    title: "Content Planner",
    singular: "content item",
    description: "Plan, draft, approve, schedule and track social, video, blog, email, landing-page and advertising content.",
    statuses: ["Idea", "Draft", "Production", "Review", "Approved", "Scheduled", "Published"],
    fields: [
      { key: "channel", label: "Channel", type: "select", required: true, options: ["Threads", "Instagram", "TikTok", "Facebook", "YouTube", "LinkedIn", "Email", "WhatsApp", "Blog", "Website", "Meta Ads", "Google Ads"] },
      { key: "format", label: "Format", type: "text" },
      { key: "publishDate", label: "Publish date", type: "date" },
      { key: "funnelStage", label: "Funnel stage", type: "select", options: ["TOFU", "MOFU", "BOFU", "Retention"] },
      { key: "owner", label: "Owner", type: "text" },
      { key: "caption", label: "Caption / copy", type: "textarea" },
      { key: "creativeBrief", label: "Creative brief", type: "textarea" },
      { key: "url", label: "Published / asset URL", type: "url" },
    ],
    starterRecords: [
      record("content-1", "Pizza debate conversation", "Chef Ammar", "Approved", { channel: "Threads", format: "Conversation post", publishDate: "2026-08-03", funnelStage: "TOFU", owner: "Kretivco Marketing", caption: "Subang people—thin crust or fluffy crust?", creativeBrief: "Natural local conversation; avoid hard sell." }),
      record("content-2", "Wagyu pizza macro reel", "Chef Ammar", "Production", { channel: "Instagram", format: "Vertical reel", publishDate: "2026-08-04", funnelStage: "TOFU", owner: "Creative Team", caption: "Pizza Mania is landing in USJ 4.", creativeBrief: "Realistic cheese and Wagyu texture, 9:16, strong first 2 seconds." }),
    ],
    aiInstruction: "Create channel-appropriate content copy, hook, CTA, creative direction, shot requirements and approval checklist for this content item. Keep it natural and non-AI sounding.",
    quickActions: ["Approve", "Mark published"],
  },
  storyboards: {
    slug: "storyboards",
    eyebrow: "Video production system",
    title: "Storyboard Studio",
    singular: "storyboard scene",
    description: "Build shot-by-shot video plans with timing, visuals, camera, audio, transitions, assets and AI-video prompts.",
    statuses: ["Idea", "Draft", "Review", "Approved", "Shot", "Edited", "Delivered"],
    fields: [
      { key: "storyboard", label: "Storyboard / video", type: "text", required: true },
      { key: "sceneNumber", label: "Scene number", type: "number" },
      { key: "duration", label: "Duration (seconds)", type: "number" },
      { key: "shotType", label: "Shot type", type: "text" },
      { key: "visual", label: "Visual / action", type: "textarea", required: true },
      { key: "camera", label: "Camera / lens / movement", type: "text" },
      { key: "audio", label: "Audio / voiceover / SFX", type: "textarea" },
      { key: "transition", label: "Transition / edit note", type: "text" },
      { key: "prompt", label: "AI video prompt", type: "textarea" },
    ],
    starterRecords: [
      record("scene-pizza-1", "Pizza Mania · Scene 01 · Hook", "Chef Ammar", "Approved", { storyboard: "Pizza Mania Launch Trailer", sceneNumber: 1, duration: 3, shotType: "Macro push-in", visual: "Wagyu pizza emerges from the stone oven with subtle steam.", camera: "50mm handheld controlled forward move", audio: "Oven SFX and upbeat percussion hit", transition: "Fast cut on beat", prompt: "Realistic Wagyu pizza emerging from oven, natural food imperfections, warm restaurant light, shallow depth of field, 9:16." }),
      record("scene-pizza-2", "Pizza Mania · Scene 02 · Product", "Chef Ammar", "Approved", { storyboard: "Pizza Mania Launch Trailer", sceneNumber: 2, duration: 4, shotType: "Macro product", visual: "Cheese pull and crisp crust close-up.", camera: "85mm macro", audio: "Cheese pull SFX", transition: "Match cut", prompt: "Macro cheese pull with realistic cheese stretch and crust texture; no synthetic gloss." }),
    ],
    aiInstruction: "Generate one production-ready storyboard scene including visual action, camera, lens, movement, lighting, duration, audio, transition, required assets and a model-specific AI-video prompt.",
    quickActions: ["Approve scene", "Mark shot"],
  },
  "brand-assets": {
    slug: "brand-assets",
    eyebrow: "Client Business DNA",
    title: "Brand & Asset Library",
    singular: "brand asset",
    description: "Store brand rules, approved claims, voice, colours, typography, asset locations and usage guidance per client.",
    statuses: ["Draft", "Review", "Approved", "Deprecated", "Archived"],
    fields: [
      { key: "assetType", label: "Asset / rule type", type: "select", required: true, options: ["Logo", "Colour", "Typography", "Brand Voice", "Photography", "Video", "Packaging", "Template", "Approved Claim", "Prohibited Usage"] },
      { key: "assetUrl", label: "Asset URL", type: "url" },
      { key: "value", label: "Value / reference", type: "text" },
      { key: "usage", label: "Usage guidance", type: "textarea" },
      { key: "tags", label: "Tags", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    starterRecords: [
      record("brand-ca-voice", "Chef Ammar Brand Voice", "Chef Ammar", "Approved", { assetType: "Brand Voice", value: "Warm, confident, generous and authentic", usage: "Use natural Malaysian language with Middle Eastern food expertise. Avoid generic corporate or AI-sounding copy.", tags: "voice, copy, social" }),
      record("brand-ca-red", "Chef Ammar Deep Red", "Chef Ammar", "Approved", { assetType: "Colour", value: "#8D2F23", usage: "Primary brand accent for campaign headers and key CTA details.", tags: "colour, primary" }),
    ],
    aiInstruction: "Turn the supplied brand information into a clear reusable brand rule with examples of correct and incorrect usage for creative and AI generation.",
    quickActions: ["Approve", "Archive"],
  },
  technology: {
    slug: "technology",
    eyebrow: "CTO control centre",
    title: "Technology Inventory",
    singular: "system",
    description: "Track repositories, applications, hosting, environments, domains, APIs, incidents, owners and operational health.",
    statuses: ["Planning", "Build", "Staging", "Healthy", "Degraded", "Incident", "Retired"],
    fields: [
      { key: "systemType", label: "System type", type: "select", required: true, options: ["Web App", "PWA", "API", "Database", "Automation", "AI Service", "Repository", "Domain", "Integration"] },
      { key: "stack", label: "Technology stack", type: "text" },
      { key: "environment", label: "Environment", type: "select", options: ["Local", "Development", "Preview", "Staging", "Production"] },
      { key: "owner", label: "Owner", type: "text" },
      { key: "url", label: "System / repository URL", type: "url" },
      { key: "provider", label: "Provider", type: "text" },
      { key: "lastDeploy", label: "Last deployment", type: "date" },
      { key: "health", label: "Health / uptime notes", type: "textarea" },
      { key: "risks", label: "Risks / incidents", type: "textarea" },
    ],
    starterRecords: [
      record("tech-kos", "KretivOS PWA", "Kretivco", "Build", { systemType: "PWA", stack: "Next.js 15 · React 19 · Tailwind · ai-nonymauz-cloud", environment: "Production", owner: "Amnan", url: "https://github.com/amnansyahmi/KretivOS", provider: "Vercel", lastDeploy: "2026-07-31", health: "Deployment healthy", risks: "Local browser storage does not sync between team members." }),
      record("tech-ai", "ai-nonymauz-cloud", "Kretivco", "Healthy", { systemType: "AI Service", stack: "FastAPI · OpenAI-compatible API · RAG", environment: "Production", owner: "Amnan", provider: "Render", health: "Connected to KretivOS through server-side route." }),
      record("tech-ca", "Chef Ammar Marketplace", "Chef Ammar", "Staging", { systemType: "Web App", stack: "Next.js · CHIP · Cloudflare", environment: "Staging", owner: "Kretivco Tech", provider: "Vercel / Cloudflare", health: "Payment setup pending", risks: "KYC dependency." }),
    ],
    aiInstruction: "Analyse the system record as a CTO. Identify reliability, security, cost, deployment and maintenance risks, then recommend the next technical actions.",
    quickActions: ["Mark healthy", "Log incident"],
  },
  approvals: {
    slug: "approvals",
    eyebrow: "Shared decision queue",
    title: "Approvals",
    singular: "approval request",
    description: "Create, review and resolve business decisions with context, value, comments, status and audit-friendly timestamps.",
    statuses: ["Draft", "Pending", "Changes requested", "Approved", "Rejected", "Cancelled"],
    fields: [
      { key: "requestType", label: "Request type", type: "select", required: true, options: ["Proposal", "Quotation", "Invoice", "Budget", "Creative", "Marketing Plan", "Technical", "Procurement", "Settlement", "Other"] },
      { key: "requester", label: "Requested by", type: "text" },
      { key: "approver", label: "Approver / decision owner", type: "text" },
      { key: "value", label: "Value / exposure (RM)", type: "number" },
      { key: "dueDate", label: "Decision due date", type: "date" },
      { key: "context", label: "Decision context", type: "textarea", required: true },
      { key: "decision", label: "Decision comment", type: "textarea" },
      { key: "reference", label: "Related record / reference", type: "text" },
    ],
    starterRecords: [
      record("app-pizza", "Pizza Mania campaign proposal", "Chef Ammar", "Pending", { requestType: "Proposal", requester: "Marketing", approver: "Kretivco Team", value: 3500, dueDate: "2026-07-31", context: "Approve August campaign scope and recommended RM2,000 media budget.", reference: "KM/CA/2026/P001" }),
      record("app-settle", "Chef Ammar weekly statement", "Chef Ammar", "Pending", { requestType: "Settlement", requester: "Finance", approver: "Kretivco Team", value: 19200, dueDate: "2026-08-04", context: "Verify 7,500 units and RM4,200 advertising reimbursement.", reference: "WS-2026-031" }),
      record("app-host", "KretivOS hosting budget", "Kretivco", "Approved", { requestType: "Technical", requester: "Technology", approver: "Kretivco Team", value: 480, dueDate: "2026-07-31", context: "Vercel Pro and supporting services.", decision: "Approved for production launch." }),
    ],
    aiInstruction: "Summarise the decision, list risks and trade-offs, identify missing evidence and recommend approve, reject or request changes with rationale.",
    amountField: "value",
    quickActions: ["Approve", "Reject", "Request changes"],
  },
};

export const workspaceOrder = ["clients", "onboarding", "crm", "sales", "finance", "settlements", "projects", "marketing-plans", "content", "storyboards", "brand-assets", "technology", "approvals"];

export function getWorkspaceConfig(slug: string) {
  return workspaceConfigs[slug];
}

export function makeRecordId(slug: string) {
  return `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
