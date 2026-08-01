import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const STAGE_KEYS = ["TOFU", "MOFU", "BOFU", "RETENTION"] as const;

type ChannelVersion = { channelId: string; channelName: string; copy: string };
type ActivityContent = {
  activityId: string;
  stageKey: string;
  title: string;
  hook: string;
  primaryCopy: string;
  cta: string;
  visualDirection: string;
  productionNotes: string;
  channelVersions: ChannelVersion[];
};

const clean = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const asArray = (value: unknown) => Array.isArray(value) ? value : [];

function normaliseFunnel(raw: unknown) {
  const funnel = asObject(raw);
  return {
    id: clean(funnel.id, 100),
    sandbox: Boolean(funnel.sandbox),
    customerId: clean(funnel.customerId, 100),
    brandId: clean(funnel.brandId, 100),
    client: clean(funnel.client, 160) || "Sandbox client",
    brandName: clean(funnel.brandName, 160),
    name: clean(funnel.name, 200) || "Marketing funnel",
    objective: clean(funnel.objective, 2000),
    audience: clean(funnel.audience, 2000),
    offer: clean(funnel.offer, 2000),
    summary: clean(funnel.summary, 3000),
    stages: asArray(funnel.stages).map((rawStage, stageIndex) => {
      const stage = asObject(rawStage);
      const key = clean(stage.key || stage.stageKey, 20).toUpperCase();
      return {
        key: STAGE_KEYS.includes(key as typeof STAGE_KEYS[number]) ? key : `STAGE-${stageIndex + 1}`,
        title: clean(stage.title, 160) || key,
        objective: clean(stage.objective, 1500),
        items: asArray(stage.items).map((rawItem) => {
          const item = asObject(rawItem);
          return {
            id: clean(item.id, 100),
            title: clean(item.title, 240) || "Untitled activity",
            format: clean(item.format, 160),
            cta: clean(item.cta, 300),
            marketingChannelIds: asArray(item.marketingChannelIds).map((id) => clean(id, 100)).filter(Boolean),
            content: asObject(item.content),
          };
        }).filter((item) => item.id),
      };
    }).filter((stage) => stage.items.length),
  };
}

async function productionContext(funnelId: string) {
  const sql = getDatabase();
  const funnelRows = await sql`
    select f.id, f.customer_id, f.brand_id, c.name as customer_name, b.name as brand_name
    from funnels f
    join customers c on c.id = f.customer_id
    left join brands b on b.id = f.brand_id
    where f.id = ${funnelId} and c.organization_id = ${ORGANIZATION_ID}
    limit 1
  `;
  if (!funnelRows.length) throw new Error("Funnel was not found.");
  const funnel = funnelRows[0];
  const [brandRows, knowledgeRows, channelRows] = await Promise.all([
    funnel.brand_id
      ? sql`
          select positioning, audience, personality, voice, messaging, photography_direction,
            approved_claims, avoid_list, status
          from brand_dna_profiles
          where brand_id = ${funnel.brand_id}
          order by (status = 'Approved') desc, updated_at desc
          limit 1
        `
      : Promise.resolve([]),
    sql`
      select title, category, content
      from knowledge_entries
      where organization_id = ${ORGANIZATION_ID}
        and customer_id = ${funnel.customer_id}
      order by updated_at desc
      limit 8
    `,
    sql`
      select id, name, category, description
      from marketing_channels
      where organization_id = ${ORGANIZATION_ID} and status = 'Active'
      order by category, name
    `,
  ]);
  return {
    customerName: funnel.customer_name,
    brandName: funnel.brand_name || "",
    brandDna: brandRows[0] || null,
    knowledge: knowledgeRows.map((row: any) => ({
      title: row.title,
      category: row.category,
      excerpt: clean(row.content, 1800),
    })),
    channels: channelRows.map((row: any) => ({ id: row.id, name: row.name, category: row.category, description: row.description || "" })),
  };
}

function fallbackContent(funnel: ReturnType<typeof normaliseFunnel>, channels: Array<{ id: string; name: string }>) {
  const channelMap = new Map(channels.map((channel) => [channel.id, channel.name]));
  return funnel.stages.flatMap((stage) => stage.items.map((item) => {
    const selectedChannels = item.marketingChannelIds.map((id) => ({ id, name: channelMap.get(id) || id }));
    const subject = funnel.offer || funnel.name;
    const hook = `${item.title}: a clear reason for ${funnel.audience || "the intended audience"} to consider ${subject}.`;
    const primaryCopy = `Introduce ${subject} through ${item.title.toLowerCase()}. Keep every statement factual, connect it to ${funnel.objective || "the campaign objective"}, and leave unconfirmed proof points for human review.`;
    return {
      activityId: item.id,
      stageKey: stage.key,
      title: item.title,
      hook,
      primaryCopy,
      cta: item.cta || "Learn more",
      visualDirection: `Create a ${item.format || "channel-appropriate"} execution focused on ${subject}. Use approved brand assets and avoid adding unverified claims or visual proof.`,
      productionNotes: "Confirm the offer, factual claims, links, dates and asset rights before publishing.",
      channelVersions: selectedChannels.map((channel) => ({ channelId: channel.id, channelName: channel.name, copy: primaryCopy })),
    };
  }));
}

function validateGenerated(
  parsed: Record<string, any>,
  fallback: ActivityContent[],
  allowedChannels: Map<string, string>,
) {
  const generated = new Map(asArray(parsed.contents).map((item) => [clean(asObject(item).activityId, 100), asObject(item)]));
  return {
    summary: clean(parsed.summary, 1600) || "A channel-ready content draft was prepared for every funnel activity.",
    contents: fallback.map((base) => {
      const item = generated.get(base.activityId) || {};
      const allowedForActivity = new Set(base.channelVersions.map((version) => version.channelId));
      const channelVersions = asArray(item.channelVersions).map((rawVersion) => {
        const version = asObject(rawVersion);
        const channelId = clean(version.channelId, 100);
        if (!channelId || !allowedForActivity.has(channelId) || !allowedChannels.has(channelId)) return null;
        return {
          channelId,
          channelName: allowedChannels.get(channelId) || clean(version.channelName, 160),
          copy: clean(version.copy, 5000),
        };
      }).filter((version): version is ChannelVersion => Boolean(version?.copy));
      return {
        ...base,
        hook: field(item.hook, base.hook, 1200),
        primaryCopy: field(item.primaryCopy, base.primaryCopy, 7000),
        cta: field(item.cta, base.cta, 500),
        visualDirection: field(item.visualDirection, base.visualDirection, 4000),
        productionNotes: field(item.productionNotes, base.productionNotes, 3000),
        channelVersions: channelVersions.length ? channelVersions : base.channelVersions,
      };
    }),
  };
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json();
    const funnel = normaliseFunnel(body.funnel);
    if (!funnel.stages.length) return NextResponse.json({ error: "Add at least one funnel activity before generating content." }, { status: 400 });

    const context = funnel.sandbox
      ? { customerName: funnel.client, brandName: funnel.brandName, brandDna: null, knowledge: [], channels: asArray(body.channels).map((item) => asObject(item)) }
      : await productionContext(funnel.id);
    const allowedChannels = new Map(context.channels.map((channel: any) => [clean(channel.id, 100), clean(channel.name, 160)]));
    const fallback = fallbackContent(funnel, context.channels as Array<{ id: string; name: string }>);
    const input = {
      funnel: {
        client: context.customerName || funnel.client,
        brand: context.brandName || funnel.brandName,
        name: funnel.name,
        objective: funnel.objective,
        audience: funnel.audience,
        offer: funnel.offer,
        summary: funnel.summary,
      },
      brandDna: context.brandDna,
      knowledge: context.knowledge,
      activities: funnel.stages.flatMap((stage) => stage.items.map((item) => ({
        activityId: item.id,
        stageKey: stage.key,
        stageObjective: stage.objective,
        title: item.title,
        format: item.format,
        currentCta: item.cta,
        currentOutline: item.content,
        channels: item.marketingChannelIds.map((id) => ({ channelId: id, channelName: allowedChannels.get(id) || id })),
      }))),
    };
    const outcome = await generateJson({
      mode: "deep",
      useRag: true,
      useTools: false,
      temperature: 0.45,
      input,
      fallback: () => ({ summary: "AI was unavailable, so KretivOS prepared structured content starters for review.", contents: fallback }),
      validate: (parsed) => validateGenerated(parsed, fallback, allowedChannels),
      system: [
        "You are Kretivco Mediaworks' senior content strategist and creative lead.",
        "Create execution-ready content for every supplied funnel activity, grounded in the customer, funnel, Brand DNA and knowledge extracts.",
        "Return JSON only without markdown fences and preserve every activityId exactly.",
        "Write natural Malaysian-market copy in the language implied by the supplied context. Avoid generic AI or corporate wording.",
        "Match the intent of TOFU, MOFU, BOFU and RETENTION. Adapt copy to each selected channel instead of repeating it verbatim.",
        "Never invent prices, promotions, dates, links, testimonials, results, certifications, product claims or client decisions.",
        "Use only approved claims. If a required fact is missing, write a clearly bracketed review placeholder such as [confirm offer deadline].",
        "Do not change channelId values or create channels that were not supplied for that activity.",
        "Schema: {summary:string,contents:[{activityId:string,hook:string,primaryCopy:string,cta:string,visualDirection:string,productionNotes:string,channelVersions:[{channelId:string,channelName:string,copy:string}]}]}",
      ],
    });

    try {
      const sql = getDatabase();
      await sql`
        insert into ai_usage_events (organization_id, capability, model, mode, latency_ms, success, metadata)
        values (${ORGANIZATION_ID}, 'funnel-content', 'auto', 'deep', ${Date.now() - started}, true,
          ${JSON.stringify({ funnelId: funnel.id || null, sandbox: funnel.sandbox, source: outcome.source, activityCount: fallback.length })}::jsonb)
      `;
    } catch {}

    return NextResponse.json({ source: outcome.source, ...outcome.value });
  } catch (error) {
    console.error("Funnel content generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate funnel content." }, { status: 502 });
  }
}
