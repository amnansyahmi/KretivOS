import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai-generation";
import { OperationsSnapshot, operationsSnapshot, snapshotLines } from "@/lib/ai-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Briefing = { headline: string; insights: { label: string; detail: string; severity: "info" | "watch" | "urgent" }[] };

/**
 * Derives the briefing without AI. This is what the Command Centre shows when AI
 * is unconfigured or unavailable, and it is deliberately factual rather than advisory.
 */
function derivedBriefing(snapshot: OperationsSnapshot): Briefing {
  const insights: Briefing["insights"] = [];

  if (snapshot.receivables.overdueCount) {
    insights.push({ label: "Collect overdue invoices", severity: "urgent", detail: `${snapshot.receivables.overdueCount} invoice(s) are past due. Chasing these is the fastest available cash.` });
  }
  if (snapshot.settlements.unverified) {
    insights.push({ label: "Verify settlements", severity: "watch", detail: `${snapshot.settlements.unverified} settlement(s) cannot be invoiced until they are verified.` });
  }
  if (snapshot.pipeline.stalled) {
    insights.push({ label: "Stalled pipeline", severity: "watch", detail: `${snapshot.pipeline.stalled} opportunity(ies) have not moved in over 14 days.` });
  }
  if (snapshot.projects.overdue) {
    insights.push({ label: "Delivery slipping", severity: "urgent", detail: `${snapshot.projects.overdue} project(s) are past their due date.` });
  }
  if (!insights.length) {
    insights.push({ label: "Nothing overdue", severity: "info", detail: "No overdue invoices, unverified settlements or late projects across the shared record." });
  }
  if (insights.length < 3) {
    insights.push({ label: "Pipeline coverage", severity: "info", detail: `${snapshot.pipeline.open} open opportunities carrying a weighted value across ${snapshot.customers.active} active customer(s).` });
  }

  return {
    headline: snapshot.attention.length
      ? `${snapshot.attention.length} area(s) need attention across cash, delivery and pipeline.`
      : "The shared record shows nothing overdue across cash, delivery and pipeline.",
    insights: insights.slice(0, 4),
  };
}

export async function GET() {
  const snapshot = await operationsSnapshot();

  if (!snapshot) {
    return NextResponse.json({ error: "The shared database is unavailable, so no briefing could be produced." }, { status: 503 });
  }

  const outcome = await generateJson<Briefing>({
    input: { snapshot: snapshotLines(snapshot), attention: snapshot.attention },
    temperature: 0.25,
    fallback: () => derivedBriefing(snapshot),
    system: [
      "You are the KretivOS chief of staff for Kretivco Mediaworks, a small Malaysian agency.",
      "You are given a factual roll-up of the company's live records. Turn it into an operational briefing.",
      "Return JSON only. Do not use markdown fences.",
      "Produce a one-sentence headline and 3 or 4 insights, most urgent first.",
      "Every insight must reference a figure from the supplied data. Never invent numbers, clients or dates.",
      "Each insight names what to do, not just what is true. Keep detail to one or two sentences.",
      "severity is 'urgent' for money or deadlines already lost, 'watch' for risk building, 'info' otherwise.",
      "Schema: {headline:string, insights:[{label:string, detail:string, severity:'info'|'watch'|'urgent'}]}",
    ],
    validate: (parsed) => {
      const insights = Array.isArray(parsed.insights)
        ? parsed.insights
            .filter((item: any) => item && typeof item.label === "string" && typeof item.detail === "string")
            .map((item: any) => ({
              label: String(item.label),
              detail: String(item.detail),
              severity: ["info", "watch", "urgent"].includes(item.severity) ? item.severity : "info",
            }))
        : [];
      if (!insights.length) return null;
      return { headline: String(parsed.headline || derivedBriefing(snapshot).headline), insights: insights.slice(0, 4) };
    },
  });

  return NextResponse.json(
    { source: outcome.source, ...outcome.value, snapshot },
    { headers: { "Cache-Control": "no-store" } },
  );
}
