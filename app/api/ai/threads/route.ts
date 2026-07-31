/**
 * Thread persistence for the header copilot.
 *
 * The copilot used to hold its history in component state, so closing the drawer
 * discarded the conversation. It now writes into the same `ai_conversations` and
 * `ai_messages` tables AI Studio already owns, which means a question asked from
 * the header is later readable — and resumable — in the Studio workspace instead
 * of living in a second, parallel history.
 *
 * The AI call itself stays in /api/ai so the streaming path is not duplicated;
 * this route only reads and records turns.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AiMode } from "@/lib/ai-nonymauz";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const MODES = new Set<AiMode>(["auto", "fast", "normal", "deep", "vision"]);
const clean = (value: unknown, max = 8000) => String(value ?? "").trim().slice(0, max);

function tablesMissing(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /ai_conversations|ai_messages/i.test(message);
}

function failure(error: unknown) {
  console.error("AI thread request failed", error);
  const message = tablesMissing(error)
    ? "AI history tables are not ready. Apply db/migrations/0004_ai_studio.sql to the Neon database."
    : error instanceof Error ? error.message : "Unable to reach AI history.";
  // A missing history table must not stop the operator asking a question, so the
  // client treats this as "history unavailable" rather than a chat failure.
  return NextResponse.json({ error: message, unavailable: true }, { status: 503 });
}

function mapMessage(row: any) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    model: row.model || "",
    mode: row.mode || "",
    sources: Array.isArray(row.sources) ? row.sources : [],
    grounded: Boolean(row.sources?.length) || undefined,
    createdAt: row.created_at,
  };
}

/** Returns the messages of one thread, or the most recent copilot threads. */
export async function GET(request: NextRequest) {
  try {
    const sql = getDatabase();
    const conversationId = clean(request.nextUrl.searchParams.get("conversationId"), 100);

    if (conversationId) {
      const owned = await sql`
        select id, title, mode from ai_conversations
        where id = ${conversationId} and organization_id = ${ORGANIZATION_ID} and status = 'Active'
      `;
      if (!owned.length) return NextResponse.json({ conversation: null, messages: [] });

      const messages = await sql`
        select * from ai_messages where conversation_id = ${conversationId}
        order by created_at asc limit 200
      `;
      return NextResponse.json({
        conversation: { id: owned[0].id, title: owned[0].title, mode: owned[0].mode },
        messages: messages.map(mapMessage),
      });
    }

    const recent = await sql`
      select c.id, c.title, c.mode, c.updated_at,
             (select count(*)::int from ai_messages m where m.conversation_id = c.id) as message_count
      from ai_conversations c
      where c.organization_id = ${ORGANIZATION_ID} and c.status = 'Active'
      order by c.updated_at desc
      limit 20
    `;
    return NextResponse.json({
      conversations: recent
        .filter((row: any) => Number(row.message_count) > 0)
        .map((row: any) => ({ id: row.id, title: row.title, mode: row.mode, updatedAt: row.updated_at })),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = clean(body.action, 40);
    const sql = getDatabase();

    if (action === "create") {
      const id = randomUUID();
      const mode = MODES.has(body.mode) ? (body.mode as AiMode) : "normal";
      await sql`
        insert into ai_conversations (id, organization_id, title, mode)
        values (${id}, ${ORGANIZATION_ID}, ${clean(body.title, 120) || "Copilot conversation"}, ${mode})
      `;
      return NextResponse.json({ conversationId: id }, { status: 201 });
    }

    if (action === "append") {
      const conversationId = clean(body.conversationId, 100);
      const role = clean(body.role, 20);
      const content = clean(body.content, 20_000);
      if (!conversationId || !["user", "assistant"].includes(role) || !content) {
        return NextResponse.json({ error: "conversationId, a user/assistant role and content are required." }, { status: 400 });
      }

      const owned = await sql`
        select id, title from ai_conversations
        where id = ${conversationId} and organization_id = ${ORGANIZATION_ID}
      `;
      if (!owned.length) return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });

      const rows = await sql`
        insert into ai_messages (conversation_id, role, content, model, mode, sources, usage)
        values (
          ${conversationId}, ${role}, ${content},
          ${clean(body.model, 120) || null}, ${MODES.has(body.mode) ? body.mode : null},
          ${JSON.stringify(Array.isArray(body.sources) ? body.sources : [])}::jsonb,
          ${JSON.stringify(body.usage && typeof body.usage === "object" ? body.usage : {})}::jsonb
        )
        returning *
      `;

      // The first question names the thread, so the Studio list is readable
      // instead of a column of "Copilot conversation".
      if (role === "user" && /^(Copilot conversation|New conversation)$/.test(String(owned[0].title))) {
        await sql`
          update ai_conversations set title = ${content.slice(0, 80)} where id = ${conversationId}
        `;
      } else {
        await sql`update ai_conversations set updated_at = now() where id = ${conversationId}`;
      }

      return NextResponse.json({ message: mapMessage(rows[0]) }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}

/** Archives a thread rather than deleting it, matching AI Studio's behaviour. */
export async function DELETE(request: NextRequest) {
  try {
    const conversationId = clean(request.nextUrl.searchParams.get("conversationId"), 100);
    if (!conversationId) return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
    await getDatabase()`
      update ai_conversations set status = 'Archived'
      where id = ${conversationId} and organization_id = ${ORGANIZATION_ID}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
