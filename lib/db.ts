import { neon } from "@neondatabase/serverless";

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
