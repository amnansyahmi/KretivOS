import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Finding = { title: string; detail: string; severity: "info" | "attention" | "important" };
type Insight = { headline: string; summary: string; findings: Finding[]; actions: string[] };

const allowed: Record<string, Array<"hr_admin" | "manager" | "finance">> = {
  attendance_review: ["hr_admin", "manager"],
  shift_review: ["hr_admin", "manager"],
  payroll_review: ["hr_admin", "finance"],
};

function safeRows(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 100).map((row) => {
    if (!row || typeof row !== "object") return {};
    return Object.fromEntries(Object.entries(row as Record<string, unknown>).slice(0, 20).map(([key, item]) => [key.slice(0, 40), typeof item === "string" ? item.slice(0, 200) : typeof item === "number" || typeof item === "boolean" ? item : null]));
  }) : [];
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const task = field(raw.task, "", 40);
    if (!allowed[task]) return NextResponse.json({ error: "Unsupported HR AI task." }, { status: 400 });
    await requireHRSession(allowed[task]);
    const input = { task, period: field(raw.period, "Current period", 40), metrics: safeRows(raw.metrics), context: field(raw.context, "", 500) };
    const fallback = (): Insight => ({ headline: "Rule-based review ready", summary: "The AI service was unavailable, so KretivOS kept the underlying figures visible without inventing a recommendation.", findings: [], actions: ["Review the highest overtime or lateness totals first.", "Confirm exceptions against approved leave and attendance evidence."] });
    const outcome = await generateJson<Insight>({
      input,
      mode: "normal",
      temperature: 0.2,
      useRag: false,
      useTools: false,
      fallback,
      system: [
        "You are the HR operations copilot inside KretivOS.",
        "Return JSON only: {headline:string,summary:string,findings:[{title:string,detail:string,severity:'info'|'attention'|'important'}],actions:string[]}.",
        "Analyse only the supplied anonymised aggregates. Never infer identity, health, misconduct, protected characteristics, intent or legal compliance.",
        "Do not recommend firing, discipline, salary changes, leave rejection or automatic approval. AI supports a human review; it never makes an HR decision.",
        "Distinguish missing data from poor performance. Mention small sample sizes. Use plain Malaysian workplace English and concise, actionable wording.",
        "For payroll, do not calculate statutory rates or claim official LHDN/EPF/SOCSO/EIS compliance. Ask HR or Finance to verify against current official portals.",
      ],
      validate: (parsed) => {
        const severities = new Set(["info", "attention", "important"]);
        const findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 5).map((item: any) => ({ title: field(item?.title, "Finding", 100), detail: field(item?.detail, "", 300), severity: severities.has(item?.severity) ? item.severity : "info" as const })).filter((item: Finding) => item.detail) : [];
        const actions = Array.isArray(parsed.actions) ? parsed.actions.map((item: unknown) => field(item, "", 180)).filter(Boolean).slice(0, 5) : [];
        const headline = field(parsed.headline, "HR review", 100);
        const summary = field(parsed.summary, "", 500);
        return summary ? { headline, summary, findings, actions } : null;
      },
    });
    return NextResponse.json({ source: outcome.source, ...outcome.value });
  } catch (error) {
    const status = error instanceof HRAuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to run HR AI review." }, { status });
  }
}
