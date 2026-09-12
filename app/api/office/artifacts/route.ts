import { executeOfficeArtifact, listOfficeArtifacts } from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const missionId = url.searchParams.get("missionId")?.trim() || null;
    const workspaceId = url.searchParams.get("workspaceId")?.trim() || null;
    return Response.json({ artifacts: await listOfficeArtifacts({ missionId, workspaceId, limit: 100 }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load artifacts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const artifactId = String(body.artifactId || "").trim();
    if (!artifactId) return Response.json({ error: "artifactId is required." }, { status: 400 });
    return Response.json({ ok: true, result: await executeOfficeArtifact(artifactId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to execute artifact." }, { status: 500 });
  }
}
