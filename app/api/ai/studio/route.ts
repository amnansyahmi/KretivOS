import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { gatherContext } from "@/lib/ai-context";
import { AiMode, aiNonymauzChat } from "@/lib/ai-nonymauz";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const modes = new Set<AiMode>(["auto", "fast", "normal", "deep", "vision"]);
const clean = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "AI Studio database request failed.";
  if (/ai_conversations|ai_messages|ai_prompt_templates|ai_usage_events|ai_saved_outputs/i.test(message)) {
    return "AI Studio tables are not ready. Apply db/migrations/0004_ai_studio.sql to the Neon database.";
  }
  return message;
}

function mapConversation(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id || "",
    customerName: row.customer_name || "Kretivco",
    title: row.title,
    mode: row.mode,
    model: row.model || "",
    useCompanyData: row.use_company_data,
    useCloudRag: row.use_cloud_rag,
    useTools: row.use_tools,
    city: row.city || "",
    status: row.status,
    preview: row.preview || "",
    messageCount: Number(row.message_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: any) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    model: row.model || "",
    mode: row.mode || "",
    sources: Array.isArray(row.sources) ? row.sources : [],
    usage: row.usage && typeof row.usage === "object" ? row.usage : {},
    feedback: row.feedback || "",
    createdAt: row.created_at,
  };
}

async function clientContext(customerId: string) {
  if (!customerId) return "";
  const sql = getDatabase();
  const [customerRows, brandRows] = await Promise.all([
    sql`
      select c.*,
        (select count(*)::int from opportunities o where o.customer_id = c.id and o.stage not in ('Won', 'Lost')) as open_opportunities,
        (select count(*)::int from projects p where p.customer_id = c.id and p.status <> 'Completed') as open_projects,
        (select count(*)::int from sales_documents d where d.customer_id = c.id and d.status in ('Sent', 'Approved', 'Overdue')) as open_documents
      from customers c where c.id = ${customerId} and c.organization_id = ${ORGANIZATION_ID}
    `,
    sql`
      select b.name, b.description, p.positioning, p.audience, p.personality, p.voice,
        p.messaging, p.photography_direction, p.approved_claims, p.avoid_list
      from brands b
      left join lateral (
        select * from brand_dna_profiles p
        where p.brand_id = b.id
        order by (p.status = 'Approved') desc, p.updated_at desc
        limit 1
      ) p on true
      where b.customer_id = ${customerId}
      order by b.name
    `,
  ]);

  const customer = customerRows[0];
  if (!customer) throw new Error("The selected client was not found.");
  const brandText = brandRows.map((brand: any) => [
    `Brand: ${brand.name}. ${brand.description || ""}`,
    brand.positioning ? `Positioning: ${brand.positioning}` : "",
    brand.audience ? `Audience: ${brand.audience}` : "",
    brand.personality ? `Personality: ${brand.personality}` : "",
    brand.voice ? `Voice: ${brand.voice}` : "",
    brand.approved_claims?.length ? `Approved claims: ${JSON.stringify(brand.approved_claims)}` : "",
    brand.avoid_list?.length ? `Avoid: ${JSON.stringify(brand.avoid_list)}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    "SELECTED CLIENT:",
    `Name: ${customer.name}`,
    `Industry: ${customer.industry || "Not recorded"}`,
    `Status: ${customer.status}`,
    `Notes: ${customer.notes || "None"}`,
    `Open opportunities: ${customer.open_opportunities}; open projects: ${customer.open_projects}; active sales documents: ${customer.open_documents}.`,
    brandText,
  ].filter(Boolean).join("\n");
}

async function overview(conversationId?: string) {
  const sql = getDatabase();
  const [conversationRows, savedRows, templateRows, customerRows, usageRows] = await Promise.all([
    sql`
      select c.*, customer.name as customer_name,
        (select content from ai_messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as preview,
        (select count(*)::int from ai_messages m where m.conversation_id = c.id) as message_count
      from ai_conversations c
      left join customers customer on customer.id = c.customer_id
      where c.organization_id = ${ORGANIZATION_ID} and c.status = 'Active'
      order by c.updated_at desc
      limit 60
    `,
    sql`
      select o.*, c.name as customer_name
      from ai_saved_outputs o left join customers c on c.id = o.customer_id
      where o.organization_id = ${ORGANIZATION_ID}
      order by o.updated_at desc limit 30
    `,
    sql`
      select * from ai_prompt_templates
      where organization_id = ${ORGANIZATION_ID}
      order by category, name
    `,
    sql`
      select id, name from customers where organization_id = ${ORGANIZATION_ID}
      order by (status = 'Active') desc, name
    `,
    sql`
      select count(*)::int as requests,
        coalesce(sum(total_tokens), 0)::int as total_tokens,
        coalesce(sum(case when success then 0 else 1 end), 0)::int as failures
      from ai_usage_events
      where organization_id = ${ORGANIZATION_ID} and created_at >= now() - interval '30 days'
    `,
  ]);

  let messages: any[] = [];
  if (conversationId) {
    const allowed = conversationRows.some((row: any) => row.id === conversationId);
    if (allowed) messages = await sql`select * from ai_messages where conversation_id = ${conversationId} order by created_at asc`;
  }

  return {
    conversations: conversationRows.map(mapConversation),
    messages: messages.map(mapMessage),
    savedOutputs: savedRows.map((row: any) => ({
      id: row.id,
      conversationId: row.conversation_id || "",
      messageId: row.message_id || "",
      customerId: row.customer_id || "",
      customerName: row.customer_name || "Kretivco",
      title: row.title,
      outputType: row.output_type,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    templates: templateRows.map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description || "",
      prompt: row.prompt,
      mode: row.mode,
      useCompanyData: row.use_company_data,
      useCloudRag: row.use_cloud_rag,
      useTools: row.use_tools,
    })),
    customers: customerRows,
    usage: usageRows[0] || { requests: 0, total_tokens: 0, failures: 0 },
  };
}

export async function GET(request: NextRequest) {
  try {
    const conversationId = clean(request.nextUrl.searchParams.get("conversationId"), 100);
    return NextResponse.json(await overview(conversationId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json();
    const action = clean(body.action, 40);
    const sql = getDatabase();

    if (action === "create_conversation") {
      const id = randomUUID();
      const mode = modes.has(body.mode) ? body.mode as AiMode : "normal";
      await sql`
        insert into ai_conversations (
          id, organization_id, customer_id, title, mode, model,
          use_company_data, use_cloud_rag, use_tools, city
        ) values (
          ${id}, ${ORGANIZATION_ID}, ${clean(body.customerId, 100) || null},
          ${clean(body.title, 120) || "New conversation"}, ${mode}, ${clean(body.model, 120) || null},
          ${bool(body.useCompanyData, true)}, ${bool(body.useCloudRag, true)},
          ${bool(body.useTools, true)}, ${clean(body.city, 120) || null}
        )
      `;
      return NextResponse.json({ conversationId: id }, { status: 201 });
    }

    if (action === "chat") {
      let conversationId = clean(body.conversationId, 100);
      const question = clean(body.message, 8000);
      if (!question) return NextResponse.json({ error: "A message is required." }, { status: 400 });

      const mode = modes.has(body.mode) ? body.mode as AiMode : "normal";
      const customerId = clean(body.customerId, 100);
      const model = clean(body.model, 120);
      const useCompanyData = bool(body.useCompanyData, true);
      const useCloudRag = bool(body.useCloudRag, true);
      const useTools = bool(body.useTools, true);
      const city = clean(body.city, 120);

      if (!conversationId) {
        conversationId = randomUUID();
        await sql`
          insert into ai_conversations (
            id, organization_id, customer_id, title, mode, model,
            use_company_data, use_cloud_rag, use_tools, city
          ) values (
            ${conversationId}, ${ORGANIZATION_ID}, ${customerId || null},
            ${question.slice(0, 72)}, ${mode}, ${model || null}, ${useCompanyData}, ${useCloudRag}, ${useTools}, ${city || null}
          )
        `;
      } else {
        const rows = await sql`select id from ai_conversations where id = ${conversationId} and organization_id = ${ORGANIZATION_ID}`;
        if (!rows.length) return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
        await sql`
          update ai_conversations set customer_id = ${customerId || null}, mode = ${mode}, model = ${model || null},
            use_company_data = ${useCompanyData}, use_cloud_rag = ${useCloudRag}, use_tools = ${useTools}, city = ${city || null}
          where id = ${conversationId} and organization_id = ${ORGANIZATION_ID}
        `;
      }

      const userMessageId = randomUUID();
      await sql`insert into ai_messages (id, conversation_id, role, content, mode) values (${userMessageId}, ${conversationId}, 'user', ${question}, ${mode})`;

      const previousRows = await sql`
        select role, content from ai_messages
        where conversation_id = ${conversationId}
        order by created_at desc limit 12
      `;
      const history = previousRows.reverse().map((row: any) => ({ role: row.role, content: row.content }));

      const [company, selectedClient] = useCompanyData
        ? await Promise.all([gatherContext(question), clientContext(customerId)])
        : [{ matches: [], snapshot: null, block: "" }, ""] as any;

      const systemPrompt = [
        "You are Kretiv AI Studio, the shared internal AI copilot for Kretivco Mediaworks.",
        "Be commercially practical, concise and natural. Separate verified facts, inference and recommendation.",
        "Never invent a price, date, client commitment, contract term or approved brand claim.",
        useTools ? "Use the deployed tools when current external information is genuinely needed. Clearly distinguish web findings from KretivOS records." : "External tools are disabled for this request.",
        company.block || selectedClient
          ? "Use the KretivOS context below as the source of truth. Cite numbered knowledge extracts such as [1] when used."
          : "No live KretivOS context was supplied. State this when the answer would otherwise imply access to company records.",
        selectedClient,
        company.block,
      ].filter(Boolean).join("\n\n");

      const completion = await aiNonymauzChat({
        messages: history,
        systemPrompt,
        model: model || undefined,
        mode,
        useRag: useCloudRag,
        useTools,
        city: city || undefined,
      });

      const assistantMessageId = randomUUID();
      const sources = company.matches.map((match: any, index: number) => ({
        index: index + 1, id: match.id, title: match.title, category: match.category, customerName: match.customerName,
      }));
      await sql`
        insert into ai_messages (id, conversation_id, role, content, model, mode, sources, usage, reasoning)
        values (${assistantMessageId}, ${conversationId}, 'assistant', ${completion.content}, ${completion.model}, ${mode},
          ${JSON.stringify(sources)}::jsonb, ${JSON.stringify(completion.usage)}::jsonb, ${completion.reasoning || null})
      `;
      await sql`
        insert into ai_usage_events (
          organization_id, conversation_id, message_id, capability, model, mode,
          prompt_tokens, completion_tokens, total_tokens, latency_ms, success, metadata
        ) values (
          ${ORGANIZATION_ID}, ${conversationId}, ${assistantMessageId}, 'chat', ${completion.model}, ${mode},
          ${Number(completion.usage.prompt_tokens || 0)}, ${Number(completion.usage.completion_tokens || 0)},
          ${Number(completion.usage.total_tokens || 0)}, ${Date.now() - started}, true,
          ${JSON.stringify({ useCompanyData, useCloudRag, useTools, customerId: customerId || null })}::jsonb
        )
      `;

      return NextResponse.json({
        conversationId,
        message: {
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          content: completion.content,
          model: completion.model,
          mode,
          sources,
          usage: completion.usage,
          feedback: "",
          createdAt: new Date().toISOString(),
        },
      });
    }

    if (action === "save_output") {
      const conversationId = clean(body.conversationId, 100);
      const messageId = clean(body.messageId, 100);
      const content = clean(body.content, 40_000);
      if (!content) return NextResponse.json({ error: "Output content is required." }, { status: 400 });
      const id = randomUUID();
      await sql`
        insert into ai_saved_outputs (
          id, organization_id, conversation_id, message_id, customer_id, title, output_type, content, metadata
        ) values (
          ${id}, ${ORGANIZATION_ID}, ${conversationId || null}, ${messageId || null}, ${clean(body.customerId, 100) || null},
          ${clean(body.title, 160) || "Saved AI output"}, ${clean(body.outputType, 80) || "AI response"},
          ${content}, ${JSON.stringify({ model: clean(body.model, 120), mode: clean(body.mode, 40) })}::jsonb
        )
      `;
      return NextResponse.json({ id }, { status: 201 });
    }

    if (action === "feedback") {
      const messageId = clean(body.messageId, 100);
      const feedback = body.feedback === "up" || body.feedback === "down" ? body.feedback : null;
      const rows = await sql`
        update ai_messages m set feedback = ${feedback}
        from ai_conversations c
        where m.id = ${messageId} and c.id = m.conversation_id and c.organization_id = ${ORGANIZATION_ID}
        returning m.id
      `;
      if (!rows.length) return NextResponse.json({ error: "Message was not found." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported AI Studio action." }, { status: 400 });
  } catch (error) {
    try {
      const sql = getDatabase();
      await sql`
        insert into ai_usage_events (organization_id, capability, mode, latency_ms, success, error)
        values (${ORGANIZATION_ID}, 'chat', 'unknown', ${Date.now() - started}, false, ${error instanceof Error ? error.message : "AI request failed"})
      `;
    } catch {}
    return NextResponse.json({ error: databaseError(error) }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = clean(request.nextUrl.searchParams.get("id"), 100);
    if (!id) return NextResponse.json({ error: "Conversation ID is required." }, { status: 400 });
    const sql = getDatabase();
    const rows = await sql`
      update ai_conversations set status = 'Archived'
      where id = ${id} and organization_id = ${ORGANIZATION_ID}
      returning id
    `;
    if (!rows.length) return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: databaseError(error) }, { status: 500 });
  }
}
