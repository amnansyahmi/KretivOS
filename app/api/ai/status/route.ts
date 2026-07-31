import { NextResponse } from "next/server";
import { aiNonymauzOrigin, aiNonymauzStatus } from "@/lib/ai-nonymauz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await aiNonymauzStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      online: false,
      origin: aiNonymauzOrigin(),
      error: error instanceof Error ? error.message : "Unable to reach ai-nonymauz-cloud.",
      models: [],
      image: { enabled: false },
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
