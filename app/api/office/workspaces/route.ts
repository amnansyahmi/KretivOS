import { getOfficeWorkspace, listOfficeMissions, listOfficeArtifacts, listOfficeWorkspaces } from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) return Response.json({ workspaces: await listOfficeWorkspaces() }, { headers: { "Cache-Control": "no-store" } });
    const workspace = await getOfficeWorkspace(id);
    if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });
    const [missions, artifacts] = await Promise.all([listOfficeMissions(50, id), listOfficeArtifacts({ workspaceId: id, limit: 100 })]);
    return Response.json({ workspace, missions, artifacts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load workspaces." }, { status: 500 });
  }
}
