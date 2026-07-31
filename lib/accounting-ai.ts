/**
 * AI assistance for the accounting workspace.
 *
 * Two rules shape everything here:
 *
 *   1. The model never produces a figure that enters the books. Amounts, totals,
 *      variances and duplicate matches are all computed in
 *      lib/accounting-signals.ts. The model reads those and explains them.
 *   2. The model never invents an account. Classification is a choice from a
 *      supplied list of real account codes, and anything outside that list is
 *      discarded rather than created.
 *
 * A model asked to spot a duplicate payment will occasionally invent one, and an
 * invented duplicate in a month-end review is worse than no review. Everything
 * below degrades to a deterministic answer when the service is unavailable, so
 * no accounting screen depends on the AI being up.
 */

import { aiNonymauzChat } from "@/lib/ai-nonymauz";
import type { Signal } from "@/lib/accounting-signals";

export type AccountChoice = { id: string; code: string; name: string; type: string };

export type AccountSuggestion = {
  accountId: string;
  code: string;
  name: string;
  confidence: number;
  reason: string;
  source: "keywords" | "ai" | "none";
};

/** Pulls the JSON object out of a reply that may still carry prose or a fence. */
function parseJson(content: string): Record<string, any> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  const candidate = (fenced ? fenced[1] : content).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Classifies a cost against the chart of accounts.
 *
 * The keyword table in lib/ocr.ts handles the vendors Kretivco actually uses and
 * answers instantly; this is the fallback for a supplier nobody has seen before.
 * The model chooses a code from the accounts it is given, so it cannot route
 * money to an account that does not exist.
 */
export async function suggestAccountWithAi({
  vendorName,
  description,
  accounts,
}: {
  vendorName: string;
  description?: string;
  accounts: AccountChoice[];
}): Promise<AccountSuggestion | null> {
  const options = accounts.filter((account) => account.type === "expense");
  if (!options.length || !vendorName.trim()) return null;

  try {
    const result = await aiNonymauzChat({
      mode: "fast",
      temperature: 0,
      useRag: false,
      useTools: false,
      maxTokens: 300,
      systemPrompt: [
        "You classify business costs for a Malaysian creative agency's accounting system.",
        "Choose the single best account for the supplier and description given.",
        "",
        "Available accounts:",
        ...options.map((account) => `${account.code} — ${account.name}`),
        "",
        'Reply with only JSON: {"code": string, "confidence": number, "reason": string}',
        "- `code` must be one of the codes listed above, exactly as written.",
        "- `confidence` is 0 to 1 and reflects how certain the classification is.",
        "- `reason` is one short sentence a bookkeeper would accept.",
        "- If nothing fits well, use the most general expense account and a low confidence.",
      ].join("\n"),
      messages: [{
        role: "user",
        content: `Supplier: ${vendorName}\nDescription: ${description || "(none)"}`,
      }],
    });

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    // The reply is checked against the list rather than trusted: a hallucinated
    // code would otherwise post real money to an account that does not exist.
    const match = options.find((account) => account.code === String(parsed.code ?? "").trim());
    if (!match) return null;

    const confidence = Number(parsed.confidence);
    return {
      accountId: match.id,
      code: match.code,
      name: match.name,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
      reason: String(parsed.reason ?? "").slice(0, 300),
      source: "ai",
    };
  } catch {
    // The keyword suggestion already made stands; classification is advisory.
    return null;
  }
}

export type PeriodReview = {
  headline: string;
  actions: { title: string; detail: string; severity: "high" | "medium" | "low" }[];
  commentary: string;
  source: "ai-nonymauz-cloud" | "computed";
};

/** A readable review built from the signals alone, used when AI is unavailable. */
function computedReview(signals: Signal[], summary: PeriodSummary): PeriodReview {
  const high = signals.filter((signal) => signal.severity === "high");
  return {
    headline: signals.length
      ? `${signals.length} item${signals.length === 1 ? "" : "s"} to check${high.length ? `, ${high.length} needing attention first` : ""}.`
      : `Nothing unusual found for ${summary.period}.`,
    actions: signals.slice(0, 8).map((signal) => ({
      title: signal.title,
      detail: signal.detail,
      severity: signal.severity,
    })),
    commentary: `Income ${summary.income.toFixed(2)}, expenses ${summary.expense.toFixed(2)}, net ${(summary.income - summary.expense).toFixed(2)} for ${summary.period}.`,
    source: "computed",
  };
}

export type PeriodSummary = {
  period: string;
  income: number;
  expense: number;
  cash: number;
  receivable: number;
  payable: number;
  topExpenses: { name: string; amount: number }[];
};

/**
 * Explains a period's numbers and what to do about them.
 *
 * The model is given figures that are already calculated and is told not to
 * recompute them, because a restated total that disagrees with the report beside
 * it destroys trust in both. Its job is prioritisation and plain language, which
 * is what a small team without a bookkeeper actually lacks.
 */
export async function reviewPeriod(signals: Signal[], summary: PeriodSummary): Promise<PeriodReview> {
  const fallback = computedReview(signals, summary);

  try {
    const result = await aiNonymauzChat({
      mode: "deep",
      temperature: 0.2,
      useRag: false,
      useTools: false,
      maxTokens: 1200,
      systemPrompt: [
        "You are reviewing a month's accounts for a small Malaysian creative agency that has no bookkeeper.",
        "",
        "Every figure below is already calculated from the ledger. Quote them as given.",
        "Never recompute, re-add or estimate a number, and never introduce one that is not listed.",
        "If something matters that the figures do not cover, say what is missing instead of guessing it.",
        "",
        "PERIOD FIGURES:",
        `- Period: ${summary.period}`,
        `- Income: RM${summary.income.toFixed(2)}`,
        `- Expenses: RM${summary.expense.toFixed(2)}`,
        `- Net: RM${(summary.income - summary.expense).toFixed(2)}`,
        `- Cash at bank: RM${summary.cash.toFixed(2)}`,
        `- Owed by clients: RM${summary.receivable.toFixed(2)}`,
        `- Owed to suppliers: RM${summary.payable.toFixed(2)}`,
        summary.topExpenses.length
          ? `- Largest costs: ${summary.topExpenses.map((row) => `${row.name} RM${row.amount.toFixed(2)}`).join("; ")}`
          : "- No costs recorded.",
        "",
        signals.length
          ? ["THINGS THE SYSTEM FLAGGED (already verified against the records):", ...signals.map((signal, index) => `${index + 1}. [${signal.severity}] ${signal.title} — ${signal.detail}`)].join("\n")
          : "THINGS THE SYSTEM FLAGGED: none.",
        "",
        'Reply with only JSON: {"headline": string, "actions": [{"title": string, "detail": string, "severity": "high"|"medium"|"low"}], "commentary": string}',
        "- `headline` is one sentence on the state of the month.",
        "- `actions` is at most six items, most important first, each a thing a person can actually do.",
        "- `commentary` is two or three sentences of plain English. No jargon, no debits and credits.",
        "- Write in British English and use RM for money.",
      ].join("\n"),
      messages: [{ role: "user", content: `Review ${summary.period} and tell me what needs attention.` }],
    });

    const parsed = parseJson(result.content);
    if (!parsed?.headline) return fallback;

    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    return {
      headline: String(parsed.headline).slice(0, 300),
      actions: actions.slice(0, 6).map((action: any) => ({
        title: String(action?.title ?? "").slice(0, 200),
        detail: String(action?.detail ?? "").slice(0, 500),
        severity: ["high", "medium", "low"].includes(action?.severity) ? action.severity : "medium",
      })).filter((action: any) => action.title),
      commentary: String(parsed.commentary ?? "").slice(0, 1500),
      source: "ai-nonymauz-cloud",
    };
  } catch {
    // The deterministic review is a complete answer, not an error state.
    return fallback;
  }
}
