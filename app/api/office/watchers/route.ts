import { createOfficeWatcher, listOfficeWatchers } from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ watchers: await listOfficeWatchers() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load watchers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const missionPrompt = String(body.missionPrompt || "").trim();
    const cadence = ["daily", "weekly", "monthly"].includes(String(body.cadence)) ? String(body.cadence) : "weekly";
    if (!name || !missionPrompt) return Response.json({ error: "Name and mission prompt are required." }, { status: 400 });
    const item = await createOfficeWatcher({ workspaceId: String(body.workspaceId || "").trim() || null, name, missionPrompt, cadence });
    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create watcher." }, { status: 500 });
  }
}
