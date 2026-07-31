import { NextRequest, NextResponse } from "next/server";
import { runDailyAutomationScan } from "@/lib/automation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    await runDailyAutomationScan();
    return NextResponse.json({ ok: true, scannedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Daily automation scan failed." }, { status: 500 });
  }
}
