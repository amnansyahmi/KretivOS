import { getDatabase } from "@/lib/db";
import { executeOfficeArtifact } from "@/lib/office-store";

async function ensureExecutionClaims() {
  const sql = getDatabase();
  await sql`
    create table if not exists ai_office_execution_claims (
      artifact_id uuid primary key references ai_office_artifacts(id) on delete cascade,
      status text not null default 'running',
      destination text,
      destination_id text,
      error text,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `;
}

/**
 * Serialises artifact execution without requiring a long DB transaction. The
 * primary-key insert is the lock, which is safe across serverless instances.
 */
export async function executeOfficeArtifactIdempotent(artifactId: string) {
  await ensureExecutionClaims();
  const sql = getDatabase();

  const existingArtifact = await sql`
    select id::text, status, destination, destination_id
      from ai_office_artifacts where id = ${artifactId}::uuid limit 1
  `;
  const artifact: any = existingArtifact[0];
  if (!artifact) throw new Error("Artifact not found.");
  if (artifact.status === "executed" && artifact.destination_id) {
    return { destination: artifact.destination, destinationId: artifact.destination_id, replay: true };
  }

  let claim = await sql`
    insert into ai_office_execution_claims (artifact_id, status)
    values (${artifactId}::uuid, 'running')
    on conflict (artifact_id) do nothing
    returning artifact_id::text, status
  `;

  if (!claim[0]) {
    const current = await sql`
      select status, destination, destination_id, started_at::text, updated_at::text
        from ai_office_execution_claims where artifact_id = ${artifactId}::uuid limit 1
    `;
    const row: any = current[0];
    if (row?.status === "completed" && row.destination_id) {
      return { destination: row.destination, destinationId: row.destination_id, replay: true };
    }

    // A serverless invocation can die after taking a claim. Allow a stale lease
    // to be reclaimed after ten minutes; otherwise report that execution is live.
    claim = await sql`
      update ai_office_execution_claims
         set status = 'running', error = null, started_at = now(), updated_at = now()
       where artifact_id = ${artifactId}::uuid
         and (status = 'failed' or (status = 'running' and started_at < now() - interval '10 minutes'))
      returning artifact_id::text, status
    `;
    if (!claim[0]) throw new Error("Artifact execution is already in progress.");
  }

  try {
    const result = await executeOfficeArtifact(artifactId);
    await sql`
      update ai_office_execution_claims
         set status = 'completed', destination = ${result.destination}, destination_id = ${result.destinationId},
             completed_at = now(), updated_at = now()
       where artifact_id = ${artifactId}::uuid
    `;
    return { ...result, replay: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artifact execution failed.";
    await sql`
      update ai_office_execution_claims set status = 'failed', error = ${message.slice(0, 1000)}, updated_at = now()
       where artifact_id = ${artifactId}::uuid
    `;
    throw error;
  }
}
