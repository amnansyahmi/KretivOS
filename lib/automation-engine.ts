export type AutomationTrigger =
  | "customer.created"
  | "opportunity.won"
  | "invoice.paid"
  | "settlement.paid"
  | "onboarding.completed"
  | "project.completed"
  | "funnel.created"
  | "funnel.activated"
  | "knowledge.created"
  | "document.generated"
  | "daily.scan";

export type AutomationAction =
  | "create_onboarding"
  | "create_onboarding_project"
  | "create_customer_knowledge"
  | "create_delivery_project"
  | "create_sales_order_draft"
  | "ensure_income_transaction"
  | "create_invoice_receipt"
  | "create_settlement_receipt"
  | "activate_customer"
  | "activate_customer_projects"
  | "create_funnel_knowledge"
  | "create_campaign_project"
  | "archive_project_summary"
  | "archive_generated_document"
  | "create_due_notifications";

export type AutomationRecipe = {
  id: string;
  name: string;
  description: string;
  workspace: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  status: "Active" | "Paused";
  approvalRequired: boolean;
  system: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
  runCount: number;
};

export type AutomationEvent = {
  id: string;
  trigger: AutomationTrigger;
  entityId: string;
  occurredAt: string;
  payload: Record<string, any>;
  source: "detected" | "manual" | "scheduled";
};

export type AutomationRun = {
  id: string;
  recipeId: string;
  recipeName: string;
  eventId: string;
  trigger: AutomationTrigger;
  entityId: string;
  startedAt: string;
  finishedAt?: string;
  status: "Pending approval" | "Success" | "Skipped" | "Failed" | "Rejected";
  actions: AutomationAction[];
  summary: string;
  error?: string;
};

export type AutomationApproval = {
  id: string;
  recipeId: string;
  recipeName: string;
  event: AutomationEvent;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  resolvedAt?: string;
};

export type KretivNotification = {
  id: string;
  type: "Reminder" | "Warning" | "Success" | "Info";
  title: string;
  description: string;
  href?: string;
  entityId?: string;
  dueDate?: string;
  read: boolean;
  createdAt: string;
};

export const AUTOMATION_RECIPE_KEY = "kretivos-automation-recipes-v2";
export const AUTOMATION_RUN_KEY = "kretivos-automation-runs-v2";
export const AUTOMATION_APPROVAL_KEY = "kretivos-automation-approvals-v2";
export const AUTOMATION_PROCESSED_KEY = "kretivos-automation-processed-v2";
export const NOTIFICATION_KEY = "kretivos-notifications-v1";
export const AUTOMATION_RUNTIME_EVENT = "kretivos:automation-event";
export const AUTOMATION_RUN_REQUEST = "kretivos:automation-run-request";
export const AUTOMATION_APPROVAL_REQUEST = "kretivos:automation-approval-request";
export const AUTOMATION_DATA_UPDATED = "kretivos:data-updated";

export const TRIGGER_CATALOG: Array<{ id: AutomationTrigger; label: string; description: string; workspace: string }> = [
  { id: "customer.created", label: "Customer created", description: "Runs after a new customer master record is saved.", workspace: "Business" },
  { id: "opportunity.won", label: "Opportunity marked Won", description: "Runs when a CRM opportunity moves into Won.", workspace: "CRM" },
  { id: "invoice.paid", label: "Invoice marked Paid", description: "Runs when an invoice changes to Paid.", workspace: "Finance" },
  { id: "settlement.paid", label: "Settlement marked Paid", description: "Runs when a weekly or client settlement is paid.", workspace: "Finance" },
  { id: "onboarding.completed", label: "Onboarding completed", description: "Runs when the client onboarding checklist is completed.", workspace: "Operations" },
  { id: "project.completed", label: "Project completed", description: "Runs when a project changes to Completed.", workspace: "Projects" },
  { id: "funnel.created", label: "Funnel created", description: "Runs when a new marketing funnel is saved.", workspace: "Marketing" },
  { id: "funnel.activated", label: "Funnel activated", description: "Runs when a funnel changes to Active.", workspace: "Marketing" },
  { id: "knowledge.created", label: "Knowledge added", description: "Runs after a Markdown knowledge entry is saved.", workspace: "Knowledge" },
  { id: "document.generated", label: "Document generated", description: "Runs after a document is generated from a template.", workspace: "Documents" },
  { id: "daily.scan", label: "Daily operational scan", description: "Checks overdue and upcoming business records once per day.", workspace: "Company" }
];

export const ACTION_CATALOG: Array<{ id: AutomationAction; label: string; description: string; compatible: AutomationTrigger[] }> = [
  { id: "create_onboarding", label: "Create onboarding checklist", description: "Creates a reusable onboarding checklist for the customer.", compatible: ["customer.created"] },
  { id: "create_onboarding_project", label: "Create onboarding project", description: "Creates a planning project linked to the customer.", compatible: ["customer.created"] },
  { id: "create_customer_knowledge", label: "Create customer profile knowledge", description: "Creates an editable Markdown profile in Knowledge.", compatible: ["customer.created"] },
  { id: "create_delivery_project", label: "Create delivery project", description: "Creates a project from the won opportunity.", compatible: ["opportunity.won"] },
  { id: "create_sales_order_draft", label: "Create draft sales order", description: "Creates a draft Sales Order from the opportunity value.", compatible: ["opportunity.won"] },
  { id: "ensure_income_transaction", label: "Record finance income", description: "Creates the income transaction only when one does not already exist.", compatible: ["invoice.paid", "settlement.paid"] },
  { id: "create_invoice_receipt", label: "Create receipt for invoice", description: "Creates a paid receipt linked to the invoice.", compatible: ["invoice.paid"] },
  { id: "create_settlement_receipt", label: "Create settlement receipt", description: "Creates a paid receipt for the settlement total.", compatible: ["settlement.paid"] },
  { id: "activate_customer", label: "Activate customer", description: "Sets the customer master status to Active.", compatible: ["onboarding.completed"] },
  { id: "activate_customer_projects", label: "Activate planning projects", description: "Moves linked planning projects into Active.", compatible: ["onboarding.completed"] },
  { id: "create_funnel_knowledge", label: "Archive funnel as Markdown", description: "Creates a searchable funnel document in Knowledge.", compatible: ["funnel.created"] },
  { id: "create_campaign_project", label: "Create campaign project", description: "Creates an active delivery project for the funnel.", compatible: ["funnel.activated"] },
  { id: "archive_project_summary", label: "Archive project summary", description: "Creates a searchable project-completion summary.", compatible: ["project.completed"] },
  { id: "archive_generated_document", label: "Archive generated document", description: "Copies generated document content into Knowledge.", compatible: ["document.generated"] },
  { id: "create_due_notifications", label: "Create due-date notifications", description: "Creates reminders for overdue invoices, settlements, projects and CRM actions.", compatible: ["daily.scan"] }
];

const createdAt = "2026-07-31T03:00:00.000Z";

export const DEFAULT_AUTOMATION_RECIPES: AutomationRecipe[] = [
  {
    id: "auto-customer-foundation",
    name: "Customer foundation",
    description: "Provision the minimum KretivOS records required for every new customer.",
    workspace: "Business",
    trigger: "customer.created",
    actions: ["create_onboarding", "create_onboarding_project", "create_customer_knowledge"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-won-opportunity-delivery",
    name: "Won opportunity handover",
    description: "Prepare the delivery project and draft commercial handover after approval.",
    workspace: "CRM & Sales",
    trigger: "opportunity.won",
    actions: ["create_delivery_project", "create_sales_order_draft"],
    status: "Active",
    approvalRequired: true,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-invoice-payment",
    name: "Invoice payment completion",
    description: "Ensure finance income is recorded and issue a receipt without duplication.",
    workspace: "Finance",
    trigger: "invoice.paid",
    actions: ["ensure_income_transaction", "create_invoice_receipt"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-settlement-payment",
    name: "Settlement payment completion",
    description: "Record settlement income and generate the corresponding receipt.",
    workspace: "Finance",
    trigger: "settlement.paid",
    actions: ["ensure_income_transaction", "create_settlement_receipt"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-onboarding-completion",
    name: "Onboarding completion",
    description: "Activate the customer and its planning projects after onboarding is complete.",
    workspace: "Operations",
    trigger: "onboarding.completed",
    actions: ["activate_customer", "activate_customer_projects"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-funnel-knowledge",
    name: "Funnel knowledge archive",
    description: "Turn every new funnel into searchable Markdown knowledge.",
    workspace: "Marketing",
    trigger: "funnel.created",
    actions: ["create_funnel_knowledge"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-funnel-campaign-project",
    name: "Active funnel campaign project",
    description: "Create a linked campaign delivery project when a funnel is activated.",
    workspace: "Marketing",
    trigger: "funnel.activated",
    actions: ["create_campaign_project"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-project-completion-archive",
    name: "Project completion archive",
    description: "Archive a completed project summary into the Knowledge Library.",
    workspace: "Projects",
    trigger: "project.completed",
    actions: ["archive_project_summary"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-document-archive",
    name: "Generated document archive",
    description: "Make every generated document searchable in the Knowledge Library.",
    workspace: "Documents",
    trigger: "document.generated",
    actions: ["archive_generated_document"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  },
  {
    id: "auto-daily-operations-scan",
    name: "Daily operations scan",
    description: "Create non-duplicated reminders for business items needing attention.",
    workspace: "Company",
    trigger: "daily.scan",
    actions: ["create_due_notifications"],
    status: "Active",
    approvalRequired: false,
    system: true,
    createdAt,
    updatedAt: createdAt,
    runCount: 0
  }
];

export function automationId(prefix: string) {
  const raw = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${raw}`;
}

export function triggerLabel(trigger: AutomationTrigger) {
  return TRIGGER_CATALOG.find((item) => item.id === trigger)?.label || trigger;
}

export function actionLabel(action: AutomationAction) {
  return ACTION_CATALOG.find((item) => item.id === action)?.label || action;
}
