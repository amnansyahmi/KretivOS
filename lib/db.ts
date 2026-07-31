import { neon } from "@neondatabase/serverless";

let cachedSql: ReturnType<typeof neon> | null = null;

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!cachedSql) {
    cachedSql = neon(connectionString, {
      fetchOptions: {
        cache: "no-store",
      },
    });
  }

  return cachedSql;
}

export async function checkDatabaseConnection() {
  const sql = getDatabase();
  const [result] = await sql<{
    database_name: string;
    server_time: string;
    postgres_version: string;
  }[]>`
    select
      current_database() as database_name,
      now()::text as server_time,
      version() as postgres_version
  `;

  return result;
}
