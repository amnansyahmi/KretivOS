import { neon, neonConfig } from "@neondatabase/serverless";

/**
 * Development escape hatch. The HTTP driver only talks to a Neon endpoint,
 * which meant the posting engine could not be exercised anywhere but
 * production. Setting NEON_HTTP_ENDPOINT points it at scripts/neon-local-proxy.mjs
 * so the unmodified application runs against a local Postgres. Unset in
 * production, this changes nothing.
 */
if (process.env.NEON_HTTP_ENDPOINT) {
  neonConfig.fetchEndpoint = process.env.NEON_HTTP_ENDPOINT;
  neonConfig.useSecureWebSocket = false;
}

type DatabaseHealthRow = {
  database_name: string;
  server_time: string;
  postgres_version: string;
};

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(connectionString);
}

export async function checkDatabaseConnection(): Promise<DatabaseHealthRow | undefined> {
  const sql = getDatabase();
  const rows = await sql`
    select
      current_database() as database_name,
      now()::text as server_time,
      version() as postgres_version
  `;

  return rows[0] as DatabaseHealthRow | undefined;
}
