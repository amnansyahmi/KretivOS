import { getDatabase } from "@/lib/db";
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

    let resolved: any = await resolveOfficeApproval(id, decision, String(body.note || "").slice(0, 2000));
    let replay = false;

    // If approval succeeded earlier but execution failed afterwards, allow the
    // same explicit approve action to retry execution without reopening the
    // approval or creating a second destination record.
    if (!resolved && decision === "approved" && body.execute !== false) {
      const sql = getDatabase();
      const rows = await sql`
        select p.artifact_id::text, p.mission_id::text, p.status, a.status as artifact_status,
               a.destination, a.destination_id
          from ai_office_approvals p join ai_office_artifacts a on a.id = p.artifact_id
         where p.id = ${id}::uuid limit 1
      `;
      const existing: any = rows[0];
      if (existing?.status === "approved" && existing?.artifact_status === "approved") {
        resolved = existing;
        replay = true;
      } else if (existing?.artifact_status === "executed") {
        return Response.json({ ok: true, decision, replay: true, execution: { destination: existing.destination, destinationId: existing.destination_id } });
      }
    }

    if (!resolved) return Response.json({ error: "Approval is no longer pending." }, { status: 409 });

    let execution = null;
    if (decision === "approved" && body.execute !== false) execution = await executeOfficeArtifact(String(resolved.artifact_id));
    return Response.json({ ok: true, decision, replay, execution });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to resolve approval." }, { status: 500 });
  }
}
