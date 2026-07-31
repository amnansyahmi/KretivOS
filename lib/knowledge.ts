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
  {
    id: "marketing-operating-system-2026-07",
    title: "2026 Marketing Operating System",
    client: "Kretivco",
    category: "Marketing Strategy",
    tags: ["2026", "full funnel", "creative testing", "measurement", "AI"],
    filename: "2026-marketing-operating-system.md",
    source: "built-in",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# 2026 Marketing Operating System

_Last reviewed: 31 July 2026. Treat platform features as market- and account-dependent and verify availability before committing client budget._

## Strategic direction

Run marketing as one connected demand system rather than isolated channel campaigns:

1. **Create demand** with distinctive short-form video, creators, useful content and broad-reach formats.
2. **Capture intent** with Search, shopping feeds, marketplace listings and conversion-ready landing pages.
3. **Convert and recover** with retargeting, cart recovery, CRM follow-up and strong offer proof.
4. **Retain and learn** with first-party audiences, repeat-purchase programmes, post-purchase content and structured campaign learnings.

## Planning rules

- Start with a commercial outcome: qualified leads, verified purchases, contribution margin or repeat purchase—not impressions alone.
- Define one primary conversion and the supporting events before launch.
- Build several meaningfully different creative concepts around audience motivations, problems, proof and use cases. Minor colour or caption changes are iterations, not true diversification.
- Prepare vertical, square and landscape assets when the media mix needs them. Keep branding, captions and the offer legible on mobile.
- Give automated campaigns high-quality inputs: accurate product or service data, conversion signals, audience evidence, creative variety and clear landing pages.
- Use AI to accelerate research, variations and analysis. A human remains responsible for factual claims, brand fit, cultural context, pricing and final approval.

## 90-day execution loop

### Weeks 1–2 · Foundation

- Confirm offer, audience, margin, geography and capacity.
- Validate GA4 or platform events from view through purchase or qualified lead.
- Establish baseline CPA, conversion rate, average order value and contribution margin.
- Produce at least three distinct creative concepts and the required format variants.

### Weeks 3–6 · Controlled learning

- Launch with enough budget and time to collect a useful signal; avoid daily structural changes.
- Review search terms, placements, creative-level outcomes and funnel drop-off.
- Record what was tested, the decision made and the evidence behind it.

### Weeks 7–12 · Scale and compound

- Increase investment behind profitable concepts and audiences gradually.
- Refresh weak creative with new concepts, not only cosmetic edits.
- Feed winning objections, hooks and proof into organic content, sales scripts, landing pages and CRM follow-up.

## Minimum campaign brief

- Business objective and primary KPI
- Audience need state and buying barrier
- Offer, price, margin and fulfilment constraint
- Funnel stage and channel role
- Three or more distinct creative concepts
- Measurement plan, attribution caveat and test hypothesis
- Owner, review date and stop/scale rule

## Official references

- [Google Marketing Live 2026](https://blog.google/products/ads-commerce/google-marketing-live-2026-collection/)
- [Meta: Demystifying creative diversification](https://www.facebook.com/business/news/demystifying-creative-diversification)
- [TikTok Creative Codes](https://ads.tiktok.com/business/en/blog/creative-best-practices-top-performing-ads)
- [Google Analytics recommended events](https://support.google.com/analytics/answer/9267735)`,
  },
  {
    id: "meta-ads-playbook-2026-07",
    title: "Meta Ads 2026 · Creative and Measurement Playbook",
    client: "Kretivco",
    category: "Channel Playbook",
    tags: ["Meta Ads", "Facebook", "Instagram", "creative diversification", "Conversions API"],
    filename: "meta-ads-2026-playbook.md",
    source: "built-in",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# Meta Ads 2026 · Creative and Measurement Playbook

_Last reviewed: 31 July 2026._

## Operating principle

Meta's delivery increasingly benefits from automation supported by strong conversion data and genuinely diverse creative. The marketer's highest-value controls are the offer, business goal, event quality, creative strategy, landing experience and budget discipline.

## Creative portfolio

Diversify by the idea a customer receives, not only by visual treatment. Build concepts across:

- Different customer motivations or use cases
- Problem, benefit, objection and proof
- Founder, customer, creator, demonstration and product-led perspectives
- Static, carousel, short video and placement-appropriate formats
- Direct-response, education, social proof and brand-building roles

Use Advantage+ creative selectively to create useful variants, but review generated text and imagery for factual accuracy and brand safety.

## Measurement foundation

- Install Meta Pixel for browser events.
- Where appropriate, pair it with Conversions API for server-side events.
- Use consistent event names, values, currency and identifiers.
- Deduplicate the same conversion sent through Pixel and Conversions API.
- Prioritise verified purchases or qualified leads over shallow engagement signals.
- Diagnose event coverage and quality before blaming creative or targeting.

## Weekly review

- Business result: purchases, qualified leads, revenue, CPA and contribution margin
- Delivery: spend, reach, frequency and learning limitations
- Creative: which distinct concepts produce results, not just which individual ad has clicks
- Funnel: landing-page conversion, cart or form abandonment and follow-up speed
- Decision: scale, hold, repair measurement, refresh concept or stop

## Official references

- [Meta Performance 5](https://www.facebook.com/business/news/meta-performance-5-techniques)
- [Meta creative diversification](https://www.facebook.com/business/news/demystifying-creative-diversification)
- [About Advantage+ creative](https://www.facebook.com/business/help/297506218282224)
- [About Conversions API](https://www.facebook.com/business/help/AboutConversionsAPI)
- [Pixel and Conversions API deduplication](https://www.facebook.com/business/help/823677331451951)`,
  },
  {
    id: "tiktok-commerce-playbook-2026-q3",
    title: "TikTok and TikTok Shop · Q3 2026 Playbook",
    client: "Kretivco",
    category: "Channel Playbook",
    tags: ["TikTok", "TikTok Shop", "short-form video", "GMV", "Events API"],
    filename: "tiktok-commerce-q3-2026.md",
    source: "built-in",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# TikTok and TikTok Shop · Q3 2026 Playbook

_Last reviewed: 31 July 2026. Product availability can vary by country, account and rollout stage; confirm Malaysian availability in TikTok Ads Manager or Seller Center._

## Creative system

- Make content feel native to the feed: vertical framing, people or product in action, fast context and clear on-screen text.
- Deliver the hook in the opening seconds, then show the problem, product proof, offer and next action.
- Mix brand-led, creator-led, customer-proof, demonstration and LIVE-derived content.
- Create several distinct concepts, then iterate winning hooks, openings and proof.
- Design for sound-on viewing while retaining captions so the message still works without sound.

## Commerce system

- Keep product titles, images, price, stock, variants and fulfilment promises accurate.
- Link content to a clear product or collection and reduce friction between discovery and checkout.
- Use affiliate or creator content only with approved claims and usage rights.
- Treat LIVE as a format requiring a run-of-show, offer cadence, moderation, stock readiness and post-LIVE follow-up.
- Evaluate automated commerce products such as GMV-focused solutions only after catalog and event diagnostics are healthy.

## Measurement

- Use standard events for important steps such as product view, add to cart, checkout and purchase.
- TikTok recommends Events API together with Pixel where appropriate.
- Deduplicate matching browser and server events so one conversion is not counted twice.
- Review gross revenue together with margin, cancellations, returns, voucher cost, affiliate commission and fulfilment capacity.

## 2026 watchlist

TikTok's Q3 2026 product preview highlights continuing investment in AI-assisted creative, automation, search, commerce, lead capture and measurement. Adopt new products only when they solve a defined campaign constraint; do not replace measurement discipline with feature adoption.

## Official references

- [TikTok Q3 2026 product preview](https://ads.tiktok.com/business/en/blog/tiktok-product-preview)
- [TikTok Creative Codes](https://ads.tiktok.com/business/en/blog/creative-best-practices-top-performing-ads)
- [TikTok Events API](https://ads.tiktok.com/help/article/events-api)
- [TikTok event deduplication](https://ads.tiktok.com/help/article/event-deduplication)
- [TikTok Shop launch considerations](https://ads.tiktok.com/help/article/considerations-when-launching-your-tiktok-shop-journey)`,
  },
  {
    id: "google-growth-playbook-2026-07",
    title: "Google Ads and AI Search · 2026 Growth Playbook",
    client: "Kretivco",
    category: "Channel Playbook",
    tags: ["Google Ads", "AI Max", "Demand Gen", "SEO", "AI Search"],
    filename: "google-growth-2026-playbook.md",
    source: "built-in",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# Google Ads and AI Search · 2026 Growth Playbook

_Last reviewed: 31 July 2026._

## Paid acquisition

- Use Search to capture explicit demand and visual or video formats to create and convert demand.
- Supply automation with accurate conversion values, strong landing pages, current first-party audience signals and a complete range of quality assets.
- Review search terms, final URLs, asset outcomes and product-feed quality. Automation still requires commercial guardrails.
- For retail, keep Merchant Center product data, availability, price and imagery aligned with the destination page.
- Test AI Max, Performance Max or Demand Gen against a defined baseline and business KPI; product names alone are not a strategy.

Google announced continued expansion of AI Max and Demand Gen capabilities in 2026. Before September 2026, review accounts using Dynamic Search Ads, automatically created assets or campaign-level broad match because Google says these legacy configurations are moving toward AI Max.

## Search and generative AI visibility

Google's guidance is to continue strong SEO fundamentals rather than chase unsupported AEO or GEO tricks:

- Publish unique, useful, people-first content based on real expertise and evidence.
- Make important pages crawlable, indexable, internally linked and technically sound.
- Use words customers actually use in titles, headings, body copy and descriptive alt text.
- Support content with relevant original images or video when useful.
- Maintain accurate product feeds and Google Business Profile information for product and local discovery.
- Do not mass-produce low-value AI pages. Human review must add accuracy, experience and original value.
- No special AI text file or artificial content chunking is required for Google Search AI features.

## Official references

- [Google Marketing Live 2026](https://blog.google/products/ads-commerce/google-marketing-live-2026-collection/)
- [AI Max migration announcement](https://blog.google/products/ads-commerce/dsa-upgrade-to-ai-max-2026/)
- [Performance Max overview](https://support.google.com/google-ads/answer/10724817)
- [Demand Gen overview](https://support.google.com/google-ads/answer/13695777)
- [Optimising for generative AI in Google Search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google guidance for AI-generated content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)`,
  },
  {
    id: "marketing-measurement-privacy-malaysia-2026",
    title: "Marketing Measurement and Malaysia Privacy Guardrails",
    client: "Kretivco",
    category: "Governance",
    tags: ["GA4", "measurement", "PDPA", "privacy", "consent", "experimentation"],
    filename: "marketing-measurement-privacy-malaysia.md",
    source: "built-in",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    content: `# Marketing Measurement and Malaysia Privacy Guardrails

_Last reviewed: 31 July 2026. This is an operating checklist, not legal advice._

## Event and KPI design

Map each funnel to standard business events before launch:

- Ecommerce: view item, add to cart, begin checkout, purchase and refund
- Lead generation: form start, form submit, qualified lead, appointment and closed sale
- Retention: repeat purchase, subscription renewal, churn or reactivation

For every event, document the owner, trigger, required parameters, source system and validation method. Keep event names consistent across analytics, ad platforms and CRM where practical.

## Reporting hierarchy

1. **Commercial truth:** verified orders, recognised revenue, margin, refunds and qualified sales outcomes.
2. **Analytics truth:** GA4 or product analytics used to understand journeys and drop-off.
3. **Platform attribution:** useful for optimisation inside each ad platform, but not an independent financial ledger.

Do not add platform-attributed conversions together as if each platform were mutually exclusive. Compare trends, run controlled experiments where material, and reconcile to CRM, marketplace or finance records.

## Data quality checklist

- Test important events on mobile and desktop.
- Pass value, currency, product or lead identifiers when relevant.
- Pair browser and server events where justified, with proper deduplication.
- Exclude internal or test traffic from production decisions.
- Record attribution windows and reporting time zones.
- Monitor broken tags, catalog errors, missing values and unexplained volume changes.

## Malaysia privacy checklist

Malaysia's Personal Data Protection framework applies to personal-data processing in commercial transactions. Marketing operations should:

- Provide a written privacy notice explaining what is collected and why.
- Collect only data needed for the stated purpose.
- Protect access, storage and transfers, including work performed by vendors.
- Keep data accurate and no longer than necessary.
- Provide a practical route for access, correction and direct-marketing opt-out requests.
- Review consent and contractual responsibilities before sharing identifiable or hashed customer data with advertising platforms.

Escalate sensitive data, children, health claims, financial data, cross-border transfers or unclear consent to qualified legal review.

## Official references

- [GA4 recommended events](https://support.google.com/analytics/answer/9267735)
- [Meta Conversions API](https://www.facebook.com/business/help/AboutConversionsAPI)
- [TikTok Events API](https://ads.tiktok.com/help/article/events-api)
- [Malaysia Personal Data Protection FAQ](https://www.pdp.gov.my/ppdpv1/en/faq/)
- [Malaysia data-subject rights](https://www.pdp.gov.my/ppdpv1/en/data-subject-rights/)`,
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
