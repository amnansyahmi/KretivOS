import { NextRequest, NextResponse } from "next/server";
import { aiNonymauzImage } from "@/lib/ai-nonymauz";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

export async function POST(request: NextRequest) {
  const started = Date.now();
  let prompt = "";
  try {
    const body = await request.json();
    prompt = String(body.prompt || "").trim().slice(0, 3000);
    if (!prompt) return NextResponse.json({ error: "An image prompt is required." }, { status: 400 });

    const image = await aiNonymauzImage({
      prompt,
      style: String(body.style || "realistic").slice(0, 40),
      size: String(body.size || "1024x1024").slice(0, 30),
    });

    try {
      const sql = getDatabase();
      await sql`
        insert into ai_usage_events (
          organization_id, capability, model, mode, latency_ms, success, metadata
        ) values (
          ${ORGANIZATION_ID}, 'image', ${image.model}, 'image', ${Date.now() - started}, true,
          ${JSON.stringify({ style: body.style || "realistic", size: body.size || "1024x1024", prompt: prompt.slice(0, 300) })}::jsonb
        )
      `;
    } catch {
      // Image generation remains usable before the optional AI Studio migration is applied.
    }

    return NextResponse.json(image);
  } catch (error) {
    try {
      const sql = getDatabase();
      await sql`
        insert into ai_usage_events (organization_id, capability, mode, latency_ms, success, error, metadata)
        values (${ORGANIZATION_ID}, 'image', 'image', ${Date.now() - started}, false,
          ${error instanceof Error ? error.message : "Image generation failed"},
          ${JSON.stringify({ prompt: prompt.slice(0, 300) })}::jsonb)
      `;
    } catch {}
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate an image." }, { status: 502 });
  }
}
