import { getDatabase } from "@/lib/db";
import { extractOfficeEvidenceUrls } from "@/lib/office-hardening-core";

export {
  compactOfficePlan,
  extractOfficeEvidenceUrls,
  isTransientOfficeError,
  parseOfficeSseTerminalState,
  retryOfficeOperation,
  validateOfficePlan,
  type OfficeSseTerminalState,
} from "@/lib/office-hardening-core";

const ORGANIZATION_ID = "org-kretivco";

export async function enrichOfficeArtifactEvidence(missionId: string) {
  const sql = getDatabase();
  const artifacts = await sql`
    select id::text, content from ai_office_artifacts where mission_id = ${missionId}::uuid
  `;
  let enriched = 0;
  for (const artifact of artifacts as any[]) {
    const urls = extractOfficeEvidenceUrls(String(artifact.content || ""));
    if (!urls.length) continue;
    const evidence = urls.map((url) => ({ type: "url", url }));
    await sql`
      update ai_office_artifacts
         set evidence = ${JSON.stringify(evidence)}::jsonb,
             confidence = coalesce(confidence, 0.75), updated_at = now()
       where id = ${artifact.id}::uuid
    `;
    enriched += 1;
  }
  return enriched;
}

export async function recoverStaleOfficeJobs(maxAgeMinutes = 20) {
  const sql = getDatabase();
  const age = Math.max(5, Math.min(maxAgeMinutes, 180));
  const rows = await sql`
    update ai_office_jobs
       set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
           error = coalesce(error, 'Worker lease expired before a terminal mission event.'),
           run_after = now() + interval '2 minutes', locked_at = null, updated_at = now()
     where organization_id = ${ORGANIZATION_ID}
       and status = 'running'
       and locked_at < now() - (${age} * interval '1 minute')
    returning id::text, status
  `;
  return rows as Array<{ id: string; status: string }>;
}

export async function getOfficeLearningContext(workspaceId?: string | null) {
  try {
    const sql = getDatabase();
    const lessons = workspaceId
      ? await sql`
          select title, quality_score, evaluation->'lessons' as lessons
            from ai_office_missions
           where organization_id = ${ORGANIZATION_ID}
             and workspace_id = ${workspaceId}::uuid
             and status = 'completed'
             and jsonb_array_length(coalesce(evaluation->'lessons', '[]'::jsonb)) > 0
           order by completed_at desc nulls last limit 6
        `
      : await sql`
          select title, quality_score, evaluation->'lessons' as lessons
            from ai_office_missions
           where organization_id = ${ORGANIZATION_ID}
             and status = 'completed'
             and jsonb_array_length(coalesce(evaluation->'lessons', '[]'::jsonb)) > 0
           order by completed_at desc nulls last limit 4
        `;

    const agentStats = await sql`
      select r.agent_id, count(*)::int as runs,
             count(*) filter (where r.status = 'completed')::int as completed,
             round(avg(r.duration_ms)::numeric, 0)::int as avg_duration_ms
        from ai_office_agent_runs r
        join ai_office_missions m on m.id = r.mission_id
       where m.organization_id = ${ORGANIZATION_ID}
       group by r.agent_id
       having count(*) >= 2
       order by count(*) desc limit 8
    `;

    const lessonLines = (lessons as any[]).flatMap((row) => {
      const values = Array.isArray(row.lessons) ? row.lessons : [];
      return values.slice(0, 3).map((lesson: unknown) => `- ${String(lesson).slice(0, 280)}${row.quality_score ? ` [quality ${row.quality_score}]` : ""}`);
    });
    const performanceLines = (agentStats as any[]).map((row) => {
      const rate = row.runs ? Math.round((Number(row.completed) / Number(row.runs)) * 100) : 0;
      return `- ${row.agent_id}: ${rate}% completed across ${row.runs} runs${row.avg_duration_ms ? `, avg ${Math.round(Number(row.avg_duration_ms) / 1000)}s` : ""}`;
    });

    if (!lessonLines.length && !performanceLines.length) return "";
    return [
      lessonLines.length ? `AI OFFICE LEARNED LESSONS:\n${lessonLines.slice(0, 12).join("\n")}` : "",
      performanceLines.length ? `RECENT AGENT RELIABILITY:\n${performanceLines.join("\n")}` : "",
      "Use these only as operational guidance. Current mission evidence and explicit client facts take precedence.",
    ].filter(Boolean).join("\n\n").slice(0, 6500);
  } catch (error) {
    console.warn("AI Office learning context unavailable", error);
    return "";
  }
}
