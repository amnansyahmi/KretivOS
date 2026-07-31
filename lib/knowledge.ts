export type KnowledgeSource = "built-in" | "markdown" | "editor" | "automation";

export type KnowledgeEntry = {
  id: string;
  title: string;
  client: string;
  category: string;
  tags: string[];
  content: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
  source: KnowledgeSource;
  customerId?: string;
  brandId?: string;
  brandName?: string;
};

export const KNOWLEDGE_STORAGE_KEY = "kretivos-knowledge";

export const builtInKnowledge: KnowledgeEntry[] = [
  {
    id: "mou-chef-ammar-v7",
    title: "MoU Kretivco × Chef Ammar v7",
    client: "Chef Ammar",
    category: "Agreement",
    tags: ["MoU", "settlement", "sales", "incentive"],
    filename: "mou-chef-ammar-v7.md",
    source: "built-in",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# MoU Kretivco × Chef Ammar v7

## Commercial operating rules

- Kretivco management fee: **RM2 per unit sold** across the agreed sales channels.
- Weekly sales statements cover **Monday to Sunday**.
- Verified weekly fees and approved advertising reimbursement are payable every **Tuesday**.
- Monthly performance incentives are payable on or before the **7th day of the following month** after the sales data is verified.

## Sales channels

- Official sales page
- Shopee Store
- TikTok Shop

## Operational responsibilities

Kretivco manages digital marketing, customer-facing product operations, creative production, sales reporting and CAMS. Chef Ammar manages stock, packaging, fulfilment and product quality.`,
  },
  {
    id: "pizza-mania-proposal",
    title: "Pizza Mania August Campaign Proposal",
    client: "Chef Ammar",
    category: "Marketing",
    tags: ["campaign", "pizza", "Meta Ads", "USJ"],
    filename: "pizza-mania-august-2026.md",
    source: "built-in",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    content: `# Pizza Mania · August 2026

## Objective

Bring new customers into Chef Ammar USJ 4 and create additional table spend beyond the launch pizza offer.

## Campaign phases

- **Introduction** — create awareness among nearby residents.
- **Trust** — retarget engaged audiences with proof, menu and location information.
- **Urgency** — drive visits before the launch offer ends.

## Recommended investment

- Kretivco management: **RM1,500**
- Recommended Meta Ads budget: **RM2,000**
- Recommended August investment: **RM3,500**`,
  },
  {
    id: "kretivos-architecture",
    title: "KretivOS Product Architecture",
    client: "Kretivco",
    category: "Technology",
    tags: ["PWA", "Next.js", "AI", "architecture"],
    filename: "kretivos-architecture.md",
    source: "built-in",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# KretivOS Product Architecture

## Current application

- Next.js PWA
- shadcn/ui-inspired interface
- ai-nonymauz-cloud through server-side OpenAI-compatible routes
- Neon PostgreSQL for shared business records

## Production foundation

- PostgreSQL system of record
- Object storage for documents and assets
- Authentication and sessions
- Background workers for settlement, reports and automation
- Audit events and document version history`,
  },
];

export function makeKnowledgeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function slugifyFilename(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "knowledge"}.md`;
}
