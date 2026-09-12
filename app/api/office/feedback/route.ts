import { recordOfficeFeedback } from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const targetType = String(body.targetType || "").trim();
    const targetId = String(body.targetId || "").trim();
    if (!targetType || !targetId) return Response.json({ error: "targetType and targetId are required." }, { status: 400 });
    const item = await recordOfficeFeedback({
      targetType,
      targetId,
      agentId: String(body.agentId || "").trim() || undefined,
      rating: body.rating ? Number(body.rating) : undefined,
      comment: String(body.comment || "").trim() || undefined,
    });
    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save feedback." }, { status: 500 });
  }
}
