import { executeOfficeArtifact, listOfficeApprovals, resolveOfficeApproval } from "@/lib/office-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ approvals: await listOfficeApprovals(100) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load approvals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const decision = body.decision === "reject" ? "rejected" : body.decision === "approve" ? "approved" : "";
    if (!id || !decision) return Response.json({ error: "Approval id and decision are required." }, { status: 400 });
    const resolved = await resolveOfficeApproval(id, decision, String(body.note || ""));
    if (!resolved) return Response.json({ error: "Approval is no longer pending." }, { status: 409 });
    let execution = null;
    if (decision === "approved" && body.execute !== false) execution = await executeOfficeArtifact(String((resolved as any).artifact_id));
    return Response.json({ ok: true, decision, execution });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to resolve approval." }, { status: 500 });
  }
}
