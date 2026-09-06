import { claimOfficeJobs, finishOfficeJob } from "@/lib/office-store";

/**
 * Drains a small number of persisted AI Office jobs. The work itself is sent
 * through the same mission endpoint as interactive runs so the orchestration,
 * grounding, artifacts, approvals and quality loop stay identical.
 */
export async function processOfficeJobs(origin: string, limit = 1) {
  const jobs = await claimOfficeJobs(limit);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const job of jobs as any[]) {
    try {
      if (job.job_type !== "mission") throw new Error(`Unsupported AI Office job type: ${job.job_type}`);
      const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
      const response = await fetch(`${origin.replace(/\/$/, "")}/api/office/mission`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ai-office-worker": "1" },
        body: JSON.stringify({ ...payload, executionMode: "background" }),
        cache: "no-store",
      });
      // Mission endpoint is SSE. Draining the body keeps the server-side mission
      // alive to completion even though nobody is watching it in a browser.
      const body = await response.text();
      if (!response.ok || body.includes('"type":"error"')) throw new Error(`Background mission failed (${response.status}).`);
      await finishOfficeJob(String(job.id));
      results.push({ id: String(job.id), ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background AI Office job failed.";
      await finishOfficeJob(String(job.id), message);
      results.push({ id: String(job.id), ok: false, error: message });
    }
  }
  return results;
}
