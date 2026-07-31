import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await checkDatabaseConnection();

    return NextResponse.json({
      ok: true,
      database: result?.database_name ?? "connected",
      serverTime: result?.server_time ?? null,
      postgresVersion: result?.postgres_version ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 503 },
    );
  }
}
