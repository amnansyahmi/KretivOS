export type CustomerStatus = "Lead" | "Active" | "Paused" | "Archived";
export type OpportunityStage = "New" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";
export type DocumentStatus = "Draft" | "Sent" | "Approved" | "Paid" | "Overdue" | "Cancelled";
export type TransactionType = "Income" | "Expense";
export type SettlementStatus = "Draft" | "Verified" | "Invoiced" | "Paid";
export type ProjectStatus = "Planning" | "Active" | "Review" | "Completed" | "On hold";
export type OnboardingStatus = "Not started" | "In progress" | "Ready" | "Completed";

export type Customer = {
  id: string;
  name: string;
  legalName: string;
  industry: string;
  status: CustomerStatus;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Opportunity = {
  id: string;
  customerId: string;
  title: string;
  stage: OpportunityStage;
  value: number;
  probability: number;
  nextAction: string;
  dueDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesDocument = {
  id: string;
  customerId: string;
  type: "Proposal" | "Quotation" | "Sales Order" | "Invoice" | "Receipt" | "Credit Note" | "MoU";
  title: string;
  reference: string;
  status: DocumentStatus;
  value: number;
  issueDate: string;
  dueDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type FinanceTransaction = {
  id: string;
  customerId: string;
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  status: "Pending" | "Cleared";
  reference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Settlement = {
  id: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  units: number;
  feePerUnit: number;
  adReimbursement: number;
  status: SettlementStatus;
  dueDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  customerId: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  budget: number;
  dueDate: string;
  owner: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Onboarding = {
  id: string;
  customerId: string;
  blueprint: string;
  status: OnboardingStatus;
  steps: { id: string; label: string; done: boolean }[];
  targetLaunch: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export const BUSINESS_STORAGE_KEY = "kretivos-business-v1";
export const CUSTOMER_STORAGE_KEY = "kretivos-customers";
export const CHANNEL_STORAGE_KEY = "kretivos-marketing-channels";

export const starterCustomers: Customer[] = [
  {
    id: "customer-chef-ammar",
    name: "Chef Ammar",
    legalName: "Chef Ammar",
    industry: "Food & Beverage",
    status: "Active",
    contactName: "Chef Ammar Al Ali",
    email: "chefammarproduct@gmail.com",
    phone: "",
    notes: "Marketplace, Pizza Mania and growth partnership.",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z"
  },
  {
    id: "customer-smart-selangor",
    name: "Smart Selangor",
    legalName: "Smart Selangor",
    industry: "Government / Public Sector",
    status: "Active",
    contactName: "Project Team",
    email: "",
    phone: "",
    notes: "Corporate website revamp engagement.",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z"
  },
  {
    id: "customer-restu-ai",
    name: "Restu.ai",
    legalName: "Restu.ai",
    industry: "Technology",
    status: "Active",
    contactName: "Internal Product Team",
    email: "",
    phone: "",
    notes: "AI wedding planning platform.",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z"
  }
];

export const starterBusinessData = {
  customers: starterCustomers,
  opportunities: [
    { id: "opp-smart-phase2", customerId: "customer-smart-selangor", title: "Smart Selangor Phase 2", stage: "Proposal" as OpportunityStage, value: 29000, probability: 65, nextAction: "Review information architecture", dueDate: "2026-08-05", notes: "", createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" },
    { id: "opp-chef-ammar", customerId: "customer-chef-ammar", title: "Chef Ammar Marketplace Growth", stage: "Won" as OpportunityStage, value: 722700, probability: 100, nextAction: "Complete payment gateway onboarding", dueDate: "2026-08-03", notes: "", createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" }
  ] as Opportunity[],
  documents: [
    { id: "doc-ca-proposal", customerId: "customer-chef-ammar", type: "Proposal" as const, title: "Pizza Mania August Campaign", reference: "KM/CA/2026/P001", status: "Approved" as DocumentStatus, value: 3500, issueDate: "2026-07-24", dueDate: "2026-08-01", notes: "", createdAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" },
    { id: "doc-ss-quotation", customerId: "customer-smart-selangor", type: "Quotation" as const, title: "Website Revamp", reference: "QT-2026-0047", status: "Sent" as DocumentStatus, value: 29000, issueDate: "2026-07-25", dueDate: "2026-08-08", notes: "", createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" }
  ] as SalesDocument[],
  transactions: [
    { id: "txn-ca-campaign", customerId: "customer-chef-ammar", type: "Income" as TransactionType, category: "Campaign management", amount: 1500, date: "2026-07-31", status: "Pending" as const, reference: "KM/CA/2026/P001", notes: "", createdAt: "2026-07-31T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" }
  ] as FinanceTransaction[],
  settlements: [
    { id: "settlement-ca-week31", customerId: "customer-chef-ammar", periodStart: "2026-07-20", periodEnd: "2026-07-26", units: 7500, feePerUnit: 2, adReimbursement: 4200, status: "Draft" as SettlementStatus, dueDate: "2026-07-28", notes: "", createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" }
  ] as Settlement[],
  projects: [
    { id: "project-chef-marketplace", customerId: "customer-chef-ammar", name: "Chef Ammar Marketplace", status: "Active" as ProjectStatus, progress: 68, budget: 0, dueDate: "2026-09-01", owner: "Kretivco Team", notes: "Payment setup and launch readiness.", createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" },
    { id: "project-smart-web", customerId: "customer-smart-selangor", name: "Smart Selangor Website Revamp", status: "Active" as ProjectStatus, progress: 42, budget: 29000, dueDate: "2026-09-30", owner: "Kretivco Team", notes: "", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" }
  ] as Project[],
  onboardings: [
    { id: "onboard-chef-ammar", customerId: "customer-chef-ammar", blueprint: "E-commerce & Marketplace", status: "In progress" as OnboardingStatus, targetLaunch: "2026-09-01", notes: "", steps: [
      { id: "profile", label: "Customer profile", done: true },
      { id: "agreement", label: "Agreement and commercial rules", done: true },
      { id: "payment", label: "Payment gateway and KYC", done: false },
      { id: "brand", label: "Brand DNA and assets", done: false },
      { id: "launch", label: "Launch checklist", done: false }
    ], createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-31T00:00:00.000Z" }
  ] as Onboarding[]
};

export function businessId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
