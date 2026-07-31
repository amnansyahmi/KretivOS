import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => clean(value) || null;
const array = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const STARTER_CONTENT_TEMPLATES = [
  { id: "content-hook-video", name: "Hook-first short video", stage: "TOFU", format: "Short video", category: "Social Media", description: "A fast attention hook followed by one clear benefit.", content: "Hook → problem or desire → visual proof → one CTA" },
  { id: "content-educational-carousel", name: "Educational carousel", stage: "TOFU", format: "Carousel", category: "Social Media", description: "Explains a problem, process or framework in swipeable steps.", content: "Cover hook → 3–6 teaching points → summary → save/share CTA" },
  { id: "content-comparison-guide", name: "Comparison guide", stage: "MOFU", format: "Guide / carousel", category: "Owned Media", description: "Helps a prospect understand options and selection criteria.", content: "Decision context → comparison criteria → options → recommendation → next step" },
  { id: "content-testimonial", name: "Customer testimonial", stage: "MOFU", format: "Video / quote", category: "Social Proof", description: "Shows the situation, experience and outcome of a real customer.", content: "Before → decision → experience → result → recommendation" },
  { id: "content-product-demo", name: "Product or service demonstration", stage: "MOFU", format: "Demo video", category: "Video", description: "Shows how the offer works and what the audience receives.", content: "Use case → demonstration → proof point → CTA" },
  { id: "content-offer-ad", name: "Conversion offer creative", stage: "BOFU", format: "Ad / sales card", category: "Paid Media", description: "Combines offer, proof, urgency and a focused action.", content: "Offer → proof → urgency or availability → CTA → fulfilment detail" },
  { id: "content-objection-faq", name: "Objection and FAQ content", stage: "BOFU", format: "FAQ / video", category: "Owned Media", description: "Answers the most common reasons a prospect delays action.", content: "Question → direct answer → evidence → reassurance → CTA" },
  { id: "content-email-nurture", name: "Email nurture sequence", stage: "MOFU", format: "Email sequence", category: "Email", description: "A multi-message sequence that educates and moves toward action.", content: "1. Welcome/value  2. Problem insight  3. Proof  4. Offer  5. Reminder" },
  { id: "content-whatsapp-followup", name: "WhatsApp follow-up", stage: "BOFU", format: "Message", category: "Messaging", description: "A concise permission-based follow-up for an enquiry or warm lead.", content: "Context → helpful answer → one question → clear next action" },
  { id: "content-review-request", name: "Review and referral request", stage: "RETENTION", format: "Message / QR", category: "Retention", description: "Requests a review or referral after a positive value moment.", content: "Thank you → specific value moment → simple request → direct link" },
  { id: "content-reorder-reminder", name: "Reorder or return reminder", stage: "RETENTION", format: "Email / message", category: "Retention", description: "Prompts a repeat purchase or return visit based on timing and value.", content: "Relevant reminder → benefit → suggested next action → CTA" },
  { id: "content-ugc-brief", name: "Creator / UGC brief", stage: "TOFU", format: "Creator brief", category: "Affiliate", description: "Gives a creator a natural structure without over-scripting delivery.", content: "Audience → authentic hook → product moment → key facts → required disclosure → CTA" },
];

async function verifyCustomerAndBrand(customerId: string, brandId: string | null) {
  if (!customerId) throw new Error("A customer is required for a production funnel.");
  const sql = getDatabase();
  const customerRows = await sql`select id from customers where id = ${customerId} and organization_id = ${ORGANIZATION_ID}`;
  if (!customerRows.length) throw new Error("Customer was not found.");
  if (brandId) {
    const brandRows = await sql`select id from brands where id = ${brandId} and customer_id = ${customerId}`;
    if (!brandRows.length) throw new Error("Brand does not belong to the selected customer.");
  }
}

async function verifyChannels(channelIds: string[]) {
  if (!channelIds.length) return;
  const sql = getDatabase();
  const rows = await sql`
    select id from marketing_channels
    where organization_id = ${ORGANIZATION_ID}
      and id = any(array(select jsonb_array_elements_text(${JSON.stringify(channelIds)}::jsonb)))
  `;
  if (rows.length !== new Set(channelIds).size) throw new Error("One or more marketing channels are invalid.");
}

async function ensureContentTemplates() {
  const sql = getDatabase();
  for (const item of STARTER_CONTENT_TEMPLATES) {
    await sql`
      insert into content_templates (
        id, organization_id, name, stage_key, format, channel_category,
        description, structure, content, status
      ) values (
        ${item.id}, ${ORGANIZATION_ID}, ${item.name}, ${item.stage}, ${item.format},
        ${item.category}, ${item.description}, ${JSON.stringify({ outline: item.content })}::jsonb,
        ${item.content}, 'Active'
      )
      on conflict (id) do nothing
    `;
  }
}

async function audit(action: string, entityId: string | null, afterData?: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, ${action}, 'funnel', ${entityId},
        ${afterData ? JSON.stringify(afterData) : null}::jsonb,
        ${JSON.stringify({ source: "funnels-api", authentication: "skipped" })}::jsonb
      )
    `;
  } catch {}
}

function mapTemplate(row: any) {
  return {
    id: row.id,
    name: row.name,
    stageKey: row.stage_key ?? "",
    format: row.format ?? "",
    channelCategory: row.channel_category ?? "",
    description: row.description ?? "",
    structure: row.structure ?? {},
    content: row.content ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listData() {
  await ensureContentTemplates();
  const sql = getDatabase();
  const [funnelRows, stageRows, activityRows, channelRows, templateRows] = await Promise.all([
    sql`
      select f.*, c.name as customer_name, b.name as brand_name
      from funnels f
      join customers c on c.id = f.customer_id
      left join brands b on b.id = f.brand_id
      where c.organization_id = ${ORGANIZATION_ID}
      order by f.updated_at desc, f.name asc
    `,
    sql`
      select s.* from funnel_stages s
      join funnels f on f.id = s.funnel_id
      join customers c on c.id = f.customer_id
      where c.organization_id = ${ORGANIZATION_ID}
      order by s.sort_order asc, s.title asc
    `,
    sql`
      select a.* from funnel_activities a
      join funnel_stages s on s.id = a.funnel_stage_id
      join funnels f on f.id = s.funnel_id
      join customers c on c.id = f.customer_id
      where c.organization_id = ${ORGANIZATION_ID}
      order by a.sort_order asc, a.created_at asc
    `,
    sql`select * from marketing_channels where organization_id = ${ORGANIZATION_ID} order by category, name`,
    sql`select * from content_templates where organization_id = ${ORGANIZATION_ID} order by stage_key, name`,
  ]);

  const channelMap = new Map(channelRows.map((row: any) => [row.id, row.name]));
  const stages = stageRows.map((row: any) => ({
    id: row.id,
    funnelId: row.funnel_id,
    key: row.stage_key,
    title: row.title,
    objective: row.objective ?? "",
    kpi: row.kpi ?? "",
    sortOrder: Number(row.sort_order),
    items: activityRows
      .filter((activity: any) => activity.funnel_stage_id === row.id)
      .map((activity: any) => {
        const channelIds = Array.isArray(activity.marketing_channel_ids) ? activity.marketing_channel_ids : [];
        return {
          id: activity.id,
          title: activity.title,
          format: activity.format ?? "",
          cta: activity.cta ?? "",
          contentTemplateId: activity.content_template_id ?? "",
          marketingChannelIds: channelIds,
          channelNames: channelIds.map((id: string) => channelMap.get(id)).filter(Boolean),
          content: activity.content ?? {},
          status: activity.status,
          sortOrder: Number(activity.sort_order),
        };
      }),
  }));

  return {
    funnels: funnelRows.map((row: any) => ({
      id: row.id,
      customerId: row.customer_id,
      client: row.customer_name,
      brandId: row.brand_id ?? "",
      brandName: row.brand_name ?? "",
      playbookKey: row.playbook_key ?? "custom",
      name: row.name,
      objective: row.objective,
      audience: row.audience ?? "",
      offer: row.offer ?? "",
      summary: row.summary ?? "",
      status: row.status,
      source: row.source,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stages: stages.filter((stage: any) => stage.funnelId === row.id),
    })),
    contentTemplates: templateRows.map(mapTemplate),
    syncedAt: new Date().toISOString(),
  };
}

async function insertStages(funnelId: string, stages: any[]) {
  const sql = getDatabase();
  let stageIndex = 0;
  for (const stageData of stages) {
    const stageId = clean(stageData.id) || randomUUID();
    const stageKey = clean(stageData.key || stageData.stageKey) || `STAGE-${stageIndex + 1}`;
    await sql`
      insert into funnel_stages (id, funnel_id, stage_key, title, objective, kpi, sort_order)
      values (
        ${stageId}, ${funnelId}, ${stageKey}, ${clean(stageData.title) || stageKey},
        ${optional(stageData.objective)}, ${optional(stageData.kpi)}, ${Number(stageData.sortOrder ?? stageIndex)}
      )
    `;

    let activityIndex = 0;
    for (const item of Array.isArray(stageData.items) ? stageData.items : []) {
      const channelIds = array(item.marketingChannelIds);
      await verifyChannels(channelIds);
      await sql`
        insert into funnel_activities (
          id, funnel_stage_id, title, format, cta, content_template_id,
          marketing_channel_ids, content, status, sort_order
        ) values (
          ${clean(item.id) || randomUUID()}, ${stageId}, ${clean(item.title) || "Untitled activity"},
          ${optional(item.format)}, ${optional(item.cta)}, ${optional(item.contentTemplateId)},
          ${JSON.stringify(channelIds)}::jsonb,
          ${JSON.stringify(object(item.content))}::jsonb,
          ${clean(item.status) || "Draft"}, ${Number(item.sortOrder ?? activityIndex)}
        )
      `;
      activityIndex += 1;
    }
    stageIndex += 1;
  }
}

export async function GET() {
  try {
    return NextResponse.json(await listData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load funnels." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let createdId = "";
  try {
    const body = await request.json();
    const customerId = clean(body.customerId);
    const brandId = optional(body.brandId);
    const name = clean(body.name);
    const objective = clean(body.objective);
    if (!name || !objective) return NextResponse.json({ error: "Funnel name and objective are required." }, { status: 400 });
    await verifyCustomerAndBrand(customerId, brandId);

    createdId = clean(body.id) || randomUUID();
    const sql = getDatabase();
    await sql`
      insert into funnels (
        id, customer_id, brand_id, playbook_key, name, objective,
        audience, offer, summary, status, source, metadata
      ) values (
        ${createdId}, ${customerId}, ${brandId}, ${optional(body.playbookKey)}, ${name}, ${objective},
        ${optional(body.audience)}, ${optional(body.offer)}, ${optional(body.summary)},
        ${clean(body.status) || "Draft"}, ${clean(body.source) || "manual"},
        ${JSON.stringify(object(body.metadata))}::jsonb
      )
    `;
    await insertStages(createdId, Array.isArray(body.stages) ? body.stages : []);
    const data = await listData();
    const funnel = data.funnels.find((item: any) => item.id === createdId);
    await audit("create", createdId, funnel);
    return NextResponse.json({ funnel, contentTemplates: data.contentTemplates }, { status: 201 });
  } catch (error) {
    if (createdId) {
      try { const sql = getDatabase(); await sql`delete from funnels where id = ${createdId}`; } catch {}
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create funnel." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = clean(body.id);
    const customerId = clean(body.customerId);
    const brandId = optional(body.brandId);
    const name = clean(body.name);
    const objective = clean(body.objective);
    if (!id || !name || !objective) return NextResponse.json({ error: "Funnel ID, name and objective are required." }, { status: 400 });
    await verifyCustomerAndBrand(customerId, brandId);

    const sql = getDatabase();
    const rows = await sql`
      update funnels set
        customer_id = ${customerId}, brand_id = ${brandId}, playbook_key = ${optional(body.playbookKey)},
        name = ${name}, objective = ${objective}, audience = ${optional(body.audience)},
        offer = ${optional(body.offer)}, summary = ${optional(body.summary)},
        status = ${clean(body.status) || "Draft"}, source = ${clean(body.source) || "manual"},
        metadata = ${JSON.stringify(object(body.metadata))}::jsonb
      where id = ${id} and customer_id in (select id from customers where organization_id = ${ORGANIZATION_ID})
      returning id
    `;
    if (!rows.length) return NextResponse.json({ error: "Funnel was not found." }, { status: 404 });
    await sql`delete from funnel_stages where funnel_id = ${id}`;
    await insertStages(id, Array.isArray(body.stages) ? body.stages : []);
    const data = await listData();
    const funnel = data.funnels.find((item: any) => item.id === id);
    await audit("update", id, funnel);
    return NextResponse.json({ funnel, contentTemplates: data.contentTemplates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update funnel." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "Funnel ID is required." }, { status: 400 });
    const sql = getDatabase();
    const rows = await sql`
      delete from funnels
      where id = ${id} and customer_id in (select id from customers where organization_id = ${ORGANIZATION_ID})
      returning id
    `;
    if (!rows.length) return NextResponse.json({ error: "Funnel was not found." }, { status: 404 });
    await audit("delete", id);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete funnel." }, { status: 500 });
  }
}
