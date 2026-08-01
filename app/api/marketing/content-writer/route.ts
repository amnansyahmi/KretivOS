import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const PLATFORMS = new Set(["Threads", "Instagram", "Facebook", "TikTok", "LinkedIn", "X", "WhatsApp", "Email", "Blog"]);
const OBJECTIVES = new Set(["Engagement", "Awareness", "Community", "Education", "Leads", "Conversion", "Launch", "Retention"]);

type ContentVariant = {
  label: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  notes: string;
};

type ContentResult = { summary: string; variants: ContentVariant[] };

const clean = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const asArray = (value: unknown) => Array.isArray(value) ? value : [];

function hashtags(value: unknown) {
  const items = Array.isArray(value) ? value : String(value ?? "").split(/[\s,]+/);
  return items
    .map((item) => clean(item, 80))
    .filter(Boolean)
    .map((item) => item.startsWith("#") ? item : `#${item.replace(/^#+/, "")}`)
    .slice(0, 10);
}

async function contentContext(customerId: string, brandId: string) {
  if (!customerId) return { customer: null, brand: null, brandDna: null, knowledge: [] };
  const sql = getDatabase();
  const customerRows = await sql`
    select id, name, industry, status, notes
    from customers
    where id = ${customerId} and organization_id = ${ORGANIZATION_ID}
    limit 1
  `;
  if (!customerRows.length) throw new Error("The selected client was not found.");

  let brand: any = null;
  let brandDna: any = null;
  if (brandId) {
    const brandRows = await sql`
      select b.id, b.name, b.description, b.status
      from brands b
      where b.id = ${brandId} and b.customer_id = ${customerId}
      limit 1
    `;
    if (!brandRows.length) throw new Error("The selected brand does not belong to this client.");
    brand = brandRows[0];
    const profileRows = await sql`
      select positioning, audience, personality, voice, messaging,
        approved_claims, avoid_list, status
      from brand_dna_profiles
      where brand_id = ${brandId}
      order by (status = 'Approved') desc, updated_at desc
      limit 1
    `;
    brandDna = profileRows[0] || null;
  }

  const knowledgeRows = await sql`
    select title, category, content
    from knowledge_entries
    where organization_id = ${ORGANIZATION_ID}
      and customer_id = ${customerId}
    order by updated_at desc
    limit 6
  `;

  return {
    customer: customerRows[0],
    brand,
    brandDna,
    knowledge: knowledgeRows.map((row: any) => ({
      title: row.title,
      category: row.category,
      excerpt: clean(row.content, 1600),
    })),
  };
}

function starterVariants(input: Record<string, any>, count: number): ContentVariant[] {
  const topic = clean(input.topic, 500) || "this topic";
  const brand = clean(input.brandName || input.clientName, 160) || "the brand";
  const bm = /BM|Malay/i.test(clean(input.language, 80));
  const cta = clean(input.cta, 300) || (bm ? "Kongsi pendapat anda di ruangan komen." : "Share your view in the replies.");
  const options: ContentVariant[] = bm ? [
    {
      label: "Soalan terus",
      hook: `Nak tanya sikit pasal ${topic}…`,
      body: `Apa pengalaman atau pendapat anda tentang ${topic}? ${brand} nak dengar jawapan sebenar daripada komuniti, bukan sekadar andaian.`,
      cta,
      hashtags: [],
      notes: "Pembukaan berbentuk soalan untuk menggalakkan balasan yang mudah dan natural.",
    },
    {
      label: "Conversation starter",
      hook: `${topic} — benda kecil yang selalu buat orang berbeza pendapat.`,
      body: `Ada yang terus setuju, ada juga yang ada cara sendiri. Untuk anda, apa yang paling penting bila bercakap tentang ${topic}?`,
      cta,
      hashtags: [],
      notes: "Angle perbualan yang tidak terlalu menjual dan sesuai untuk engagement.",
    },
    {
      label: "Community insight",
      hook: `Kami tengah kumpul pandangan sebenar tentang ${topic}.`,
      body: `Kalau anda pernah melalui atau mencuba perkara ini, kongsikan apa yang menjadi dan apa yang tidak. Jawapan anda boleh bantu ${brand} faham komuniti dengan lebih baik.`,
      cta,
      hashtags: [],
      notes: "Meminta pengalaman khusus biasanya menghasilkan komen yang lebih bernilai.",
    },
  ] : [
    {
      label: "Direct question",
      hook: `A quick question about ${topic}…`,
      body: `What has your real experience been with ${topic}? ${brand} would rather hear directly from the community than make assumptions.`,
      cta,
      hashtags: [],
      notes: "A low-friction question designed to invite natural replies.",
    },
    {
      label: "Conversation starter",
      hook: `${topic} is one of those subjects people rarely agree on.`,
      body: `Some people have a firm view; others have found their own approach. What matters most to you when it comes to ${topic}?`,
      cta,
      hashtags: [],
      notes: "A discussion-led angle that avoids sounding like an advertisement.",
    },
    {
      label: "Community insight",
      hook: `We are collecting honest views about ${topic}.`,
      body: `If you have dealt with this before, share what worked and what did not. Your answer can help ${brand} understand the community more clearly.`,
      cta,
      hashtags: [],
      notes: "Asking for first-hand experience tends to produce more useful comments.",
    },
  ];
  return options.slice(0, count);
}

function validateResult(parsed: Record<string, any>, fallback: ContentResult, count: number): ContentResult {
  const generated = asArray(parsed.variants).map((raw) => {
    const item = asObject(raw);
    const body = clean(item.body, 7000);
    if (!body) return null;
    return {
      label: clean(item.label, 80) || "Draft",
      hook: clean(item.hook, 1200),
      body,
      cta: clean(item.cta, 600),
      hashtags: hashtags(item.hashtags),
      notes: clean(item.notes, 1600),
    };
  }).filter((item): item is ContentVariant => Boolean(item));

  const variants = Array.from({ length: count }, (_, index) => generated[index] || fallback.variants[index]).filter(Boolean);
  return {
    summary: clean(parsed.summary, 1000) || fallback.summary,
    variants,
  };
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json();
    const action = clean(body.action, 20) === "refine" ? "refine" : "generate";
    const customerId = clean(body.customerId, 100);
    const brandId = clean(body.brandId, 100);
    const platformRaw = clean(body.platform, 40);
    const objectiveRaw = clean(body.objective, 40);
    const topic = clean(body.topic, 1200);
    if (!topic && action === "generate") return NextResponse.json({ error: "Add a topic or content idea first." }, { status: 400 });

    const platform = PLATFORMS.has(platformRaw) ? platformRaw : "Threads";
    const objective = OBJECTIVES.has(objectiveRaw) ? objectiveRaw : "Engagement";
    const context = await contentContext(customerId, brandId);
    const count = action === "refine" ? 1 : 3;
    const input = {
      action,
      clientName: clean(context.customer?.name, 160) || "Kretivco / general",
      industry: clean(context.customer?.industry, 160),
      brandName: clean(context.brand?.name, 160),
      brandDescription: clean(context.brand?.description, 1200),
      brandDna: context.brandDna,
      knowledge: context.knowledge,
      platform,
      objective,
      format: field(body.format, "Single post", 80),
      topic: topic || clean(body.draft?.body, 1200),
      audience: clean(body.audience, 800),
      language: field(body.language, "Natural BM", 80),
      tone: field(body.tone, "Natural conversation", 100),
      keyFacts: clean(body.keyFacts, 1800),
      cta: clean(body.cta, 500),
      instruction: action === "refine" ? field(body.instruction, "Make this draft more natural", 500) : "",
      draft: action === "refine" ? asObject(body.draft) : null,
      variationCount: count,
    };
    const fallback: ContentResult = {
      summary: action === "refine"
        ? "AI was unavailable, so the existing draft was kept for manual editing."
        : `Three editable ${platform} directions prepared for ${objective.toLowerCase()}.`,
      variants: action === "refine"
        ? [{
            label: "Current draft",
            hook: clean(input.draft?.hook, 1200),
            body: clean(input.draft?.body, 7000) || input.topic,
            cta: clean(input.draft?.cta, 600),
            hashtags: hashtags(input.draft?.hashtags),
            notes: clean(input.draft?.notes, 1600),
          }]
        : starterVariants(input, count),
    };

    const outcome = await generateJson<ContentResult>({
      mode: body.useCurrentResearch ? "deep" : "normal",
      useRag: true,
      useTools: Boolean(body.useCurrentResearch),
      temperature: action === "refine" ? 0.4 : 0.65,
      input,
      fallback: () => fallback,
      validate: (parsed) => validateResult(parsed, fallback, count),
      system: [
        "You are Kretivco Mediaworks' senior social content writer for Malaysian audiences.",
        `Create ${count} publishable content ${count === 1 ? "draft" : "directions"} for the selected platform and objective.`,
        "Return JSON only without markdown fences. Schema: {summary:string,variants:[{label:string,hook:string,body:string,cta:string,hashtags:string[],notes:string}]}",
        "Write in the requested language. Natural Malaysian mixed language is allowed when requested; do not make Malay formal or textbook-like.",
        "Respect the Brand DNA voice, preferred messaging, approved claims and avoid list. Use supplied client knowledge when relevant.",
        "Never invent prices, promotions, dates, ingredients, certifications, testimonials, performance claims, locations or product facts.",
        "Avoid AI-sounding filler, corporate slogans and words such as elevate, revolutionise, captivating, stunning, game-changing or world-class.",
        "Do not overuse emojis, hashtags, rhetorical questions, em dashes or exclamation marks. Hashtags must be empty when they do not improve the selected platform.",
        "The hook and body must not repeat each other. Notes should briefly explain the strategic angle, not praise the writing.",
        "For engagement and community objectives, invite a specific low-friction response and avoid a hard sell.",
        "For conversion, use one clear action but never manufacture urgency or scarcity.",
        "For Threads, favour a human conversation opener, short paragraphs and reply-worthy specificity; avoid hashtag stuffing.",
        "For Instagram and Facebook, make the first line useful, keep the caption scannable and use only relevant hashtags.",
        "For TikTok, write a spoken hook and short-form script direction that can be delivered naturally on camera.",
        "For LinkedIn, lead with a concrete observation or experience instead of motivational clichés.",
        action === "refine"
          ? "Refine only the supplied draft according to the instruction. Preserve every verified fact and return exactly one variant."
          : "Make the three variants meaningfully different: question-led, point-of-view, and useful/community-led.",
      ],
    });

    try {
      const sql = getDatabase();
      await sql`
        insert into ai_usage_events (organization_id, capability, model, mode, latency_ms, success, metadata)
        values (${ORGANIZATION_ID}, 'content-writer', 'auto', ${body.useCurrentResearch ? "deep" : "normal"},
          ${Date.now() - started}, true,
          ${JSON.stringify({ source: outcome.source, action, platform, objective, customerId: customerId || null, brandId: brandId || null })}::jsonb)
      `;
    } catch {}

    return NextResponse.json({ source: outcome.source, ...outcome.value });
  } catch (error) {
    console.error("Content Writer generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate content." }, { status: 502 });
  }
}
