import { getDatabase } from "@/lib/db";
import { getOfficeWorkspace } from "@/lib/office-store";

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "client", "for", "from", "in", "into", "is", "it", "of", "on",
  "or", "the", "this", "to", "with", "mission", "plan", "strategy", "please", "buat", "untuk", "yang", "dan", "dengan",
]);

function tokenize(value: string) {
  return new Set(String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 2 && !STOP.has(token)));
}

function relevance(query: Set<string>, text: string) {
  if (!query.size) return 0;
  const doc = tokenize(text);
  if (!doc.size) return 0;
  let shared = 0;
  for (const token of query) if (doc.has(token)) shared += 1;
  return shared / query.size + shared / Math.max(20, doc.size) * 0.35;
}

function recencyBoost(dateValue: unknown) {
  const time = Date.parse(String(dateValue || ""));
  if (!Number.isFinite(time)) return 0;
  const days = Math.max(0, (Date.now() - time) / 86_400_000);
  return Math.max(0, 0.18 - Math.min(days, 180) / 1000);
}

/**
 * Retrieves workspace memory by relevance, not only recency. We deliberately use
 * deterministic ranking here so it stays cheap/free and works before adding a
 * vector store. Recent high-quality work still gets a small tie-break boost.
 */
export async function getRelevantOfficeWorkspaceContext(workspaceId?: string | null, queryText = "") {
  if (!workspaceId) return "";
  try {
    const workspace: any = await getOfficeWorkspace(workspaceId);
    if (!workspace) return "";
    const sql = getDatabase();
    const [missions, artifacts] = await Promise.all([
      sql`
        select id::text, title, mission, objective, summary, status, quality_score, final_output, created_at::text, completed_at::text
          from ai_office_missions
         where workspace_id = ${workspaceId}::uuid and status in ('completed','running','waiting_input')
         order by created_at desc limit 60
      `,
      sql`
        select id::text, title, artifact_type, content, status, confidence, evidence, updated_at::text
          from ai_office_artifacts
         where workspace_id = ${workspaceId}::uuid and status not in ('rejected','superseded')
         order by updated_at desc limit 100
      `,
    ]);

    const query = tokenize(queryText);
    const rankedMissions = (missions as any[]).map((row) => {
      const text = `${row.title || ""} ${row.mission || ""} ${row.objective || ""} ${row.summary || ""} ${row.final_output || ""}`;
      const quality = Number(row.quality_score || 0) / 1000;
      return { row, score: relevance(query, text) + recencyBoost(row.completed_at || row.created_at) + quality };
    }).sort((a, b) => b.score - a.score);

    const rankedArtifacts = (artifacts as any[]).map((row) => {
      const text = `${row.title || ""} ${row.artifact_type || ""} ${row.content || ""}`;
      const confidence = Number(row.confidence || 0) / 10;
      return { row, score: relevance(query, text) + recencyBoost(row.updated_at) + confidence };
    }).sort((a, b) => b.score - a.score);

    // If a very generic mission has no lexical signal, relevance naturally falls
    // back to recency/quality rather than returning an empty memory block.
    const selectedMissions = rankedMissions.slice(0, 6).map(({ row }) => row);
    const selectedArtifacts = rankedArtifacts.slice(0, 10).map(({ row }) => row);

    const lines = [
      `CLIENT WORKSPACE: ${workspace.name}`,
      workspace.industry ? `Industry: ${workspace.industry}` : "",
      workspace.brand_description ? `Brand: ${workspace.brand_description}` : "",
      workspace.website_url ? `Website: ${workspace.website_url}` : "",
      workspace.customer_notes ? `Client notes: ${workspace.customer_notes}` : "",
      workspace.summary ? `Workspace summary: ${workspace.summary}` : "",
      Array.isArray(workspace.goals) && workspace.goals.length ? `Goals: ${workspace.goals.join("; ")}` : "",
      selectedMissions.length ? `RELEVANT PRIOR MISSIONS:\n${selectedMissions.map((m: any) => `- ${m.title}: ${m.objective || m.summary || ""}${m.quality_score ? ` (quality ${m.quality_score})` : ""}${m.final_output ? `\n  Prior outcome: ${String(m.final_output).replace(/\s+/g, " ").slice(0, 700)}` : ""}`).join("\n")}` : "",
      selectedArtifacts.length ? `RELEVANT REUSABLE DELIVERABLES:\n${selectedArtifacts.map((a: any) => `- ${a.title} [${a.artifact_type}, ${a.status}]: ${String(a.content || "").replace(/\s+/g, " ").slice(0, 650)}`).join("\n")}` : "",
      "Memory is historical context, not automatically current fact. Prefer explicit current inputs and fresh evidence when they conflict.",
    ];
    return lines.filter(Boolean).join("\n\n").slice(0, 18000);
  } catch (error) {
    console.warn("AI Office relevant workspace memory unavailable", error);
    return "";
  }
}
