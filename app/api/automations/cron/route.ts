import { NextRequest, NextResponse } from "next/server";
import { runDailyAutomationScan } from "@/lib/automation-server";
import { enqueueDueOfficeWatchers } from "@/lib/office-store";
import { processOfficeJobs } from "@/lib/office-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    await runDailyAutomationScan();
    const watchersQueued = await enqueueDueOfficeWatchers();
    const officeJobs = await processOfficeJobs(request.nextUrl.origin, 1);
    return NextResponse.json({ ok: true, scannedAt: new Date().toISOString(), aiOffice: { watchersQueued, jobs: officeJobs } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Daily automation scan failed." }, { status: 500 });
  }
}
