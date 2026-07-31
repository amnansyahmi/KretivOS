/**
 * Workspace-aware AI behaviour.
 *
 * `module` used to be passed to the chat route as a decorative label: the copilot
 * on the Finance screen received exactly the same prompt and the same generic
 * snapshot as the copilot on Storyboard Studio. This maps each workspace to the
 * things that actually differ — what the operator is looking at, which part of
 * the operations snapshot leads, and which vocabulary to expand a short question
 * with before searching the knowledge library.
 */

export type SnapshotSection = "customers" | "pipeline" | "receivables" | "settlements" | "projects" | "cash";

export type WorkspaceGuidance = {
  label: string;
  focus: string;
  /** Snapshot sections to list first. Everything else still follows. */
  lead: SnapshotSection[];
  /** Added to short questions so retrieval has domain vocabulary to match on. */
  expansion: string[];
};

const GENERAL: WorkspaceGuidance = {
  label: "General",
  focus: "Answer across the whole company record without assuming one department.",
  lead: [],
  expansion: [],
};

const WORKSPACES: Record<string, WorkspaceGuidance> = {
  "Command Centre": {
    label: "Command Centre",
    focus: "The operator is scanning the whole company. Lead with what needs a decision today, in priority order.",
    lead: ["receivables", "pipeline", "projects"],
    expansion: ["priority", "risk", "deadline"],
  },
  "Financial Projection": {
    label: "Financial Projection",
    focus: "This is a forecast scenario, not actuals. Never present projected figures as booked revenue, and say which is which.",
    lead: ["cash", "settlements"],
    expansion: ["projection", "forecast", "incentive", "management fee", "unjuran"],
  },
  Approvals: {
    label: "Approval Inbox",
    focus: "Items here are waiting on a human decision. Explain what approving or rejecting each one commits Kretivco to.",
    lead: ["receivables", "settlements"],
    expansion: ["approval", "kelulusan", "sign off", "authorisation"],
  },
  Finance: {
    label: "Finance",
    focus: "Be precise with money. Distinguish invoiced, collected and cleared, and never round a figure the operator will act on.",
    lead: ["receivables", "cash", "settlements"],
    expansion: ["invoice", "invois", "payment", "bayaran", "receivable", "outstanding", "tax", "cukai"],
  },
  Settlement: {
    label: "Weekly Settlement",
    focus: "Weekly settlements follow the MoU rules. Quote the agreed rate and period from the record rather than assuming the usual one.",
    lead: ["settlements", "receivables"],
    expansion: ["settlement", "penyelesaian", "weekly", "mingguan", "per unit", "reimbursement", "incentive", "insentif"],
  },
  "CRM & Pipeline": {
    label: "CRM and Pipeline",
    focus: "Focus on movement: what stage each opportunity is in, what is stalled, and the next concrete action.",
    lead: ["pipeline", "customers"],
    expansion: ["opportunity", "pipeline", "proposal", "sebut harga", "follow up", "stage"],
  },
  "Sales & Documents": {
    label: "Sales and Documents",
    focus: "Quotations and invoices are commercial commitments. Preserve approval status and never invent a price or a reference number.",
    lead: ["receivables", "pipeline"],
    expansion: ["quotation", "sebut harga", "invoice", "invois", "contract", "kontrak", "scope"],
  },
  "Projects & Delivery": {
    label: "Projects and Delivery",
    focus: "Report delivery honestly: progress, blockers and dates the client is expecting.",
    lead: ["projects", "customers"],
    expansion: ["project", "projek", "delivery", "penghantaran", "milestone", "deadline", "scope"],
  },
  "Marketing Plans": {
    label: "Marketing Plans",
    focus: "Ground creative recommendations in the brand record and approved claims. Flag anything on an avoid list.",
    lead: ["customers", "pipeline"],
    expansion: ["campaign", "kempen", "audience", "brand", "positioning", "channel", "offer"],
  },
  "Storyboard Studio": {
    label: "Storyboard Studio",
    focus: "Think in shots and production practicality. Respect the brand's tone and any approved claim wording.",
    lead: ["customers"],
    expansion: ["storyboard", "shot", "video", "script", "visual", "production"],
  },
  "Prompt Lab": {
    label: "Prompt Lab",
    focus: "Produce model-ready prompts. Be specific about subject, style, framing and constraints instead of writing prose.",
    lead: [],
    expansion: ["prompt", "image", "video", "style", "reference"],
  },
  "Content Planner": {
    label: "Content Planner",
    focus: "Plan against the real calendar and the client's funnel stage, not a generic content week.",
    lead: ["customers", "projects"],
    expansion: ["content", "kandungan", "calendar", "posting", "funnel", "channel"],
  },
  Knowledge: {
    label: "Knowledge Library",
    focus: "Answer strictly from the retrieved extracts and cite them. If they do not cover the question, say so.",
    lead: [],
    expansion: [],
  },
  HRMS: {
    label: "HR and Team",
    focus: "HR records are confidential and often statutory. Never guess an EPF, SOCSO, EIS or PCB figure — say it must be verified against the official portal.",
    lead: ["cash"],
    expansion: ["leave", "cuti", "claim", "tuntutan", "payroll", "gaji", "attendance", "kehadiran", "employee"],
  },
  Technology: {
    label: "Technology",
    focus: "Be concrete about the current stack and what is actually deployed rather than what is planned.",
    lead: [],
    expansion: ["system", "integration", "database", "deployment", "api"],
  },
};

export function workspaceGuidance(module: string): WorkspaceGuidance {
  return WORKSPACES[module] || { ...GENERAL, label: module || "General" };
}

/**
 * Widens a short question with workspace vocabulary. "Is it paid?" carries almost
 * no searchable signal on its own, but the same question inside Settlement should
 * still reach the settlement documents. Long questions already carry their own
 * terms and are left alone so the expansion cannot outweigh what was actually asked.
 */
export function expandQuery(question: string, module?: string) {
  const guidance = workspaceGuidance(module || "");
  const wordCount = String(question ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (!guidance.expansion.length || wordCount > 8) return question;
  return `${question} ${guidance.expansion.join(" ")}`;
}
