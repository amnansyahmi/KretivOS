import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";
import { detailsText, parseSubjectDetails, WRITING_GUARDRAILS } from "@/lib/writing-assist";
import { enforceLanguage, languageDirectives, resolveWritingLanguage } from "@/lib/writing-language";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImproveResult = { improved: string };

/**
 * The offline fallback, used when the AI service is unreachable.
 *
 * It used to collapse every run of whitespace, newlines included, so a template
 * whose whole contract is "one note per line" came back as a single paragraph
 * and the printed quotation lost its numbering. Lines are structure here, not
 * spacing: only the space *within* a line is tidied.
 */
function tidy(text: string) {
  const lines = text.split(/\r?\n/).map((line) =>
    line.replace(/[ \t]+/g, " ").replace(/ +([,.;:!?])/g, "$1").trim(),
  );
  const cleaned = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return cleaned;
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const text = field(raw.text, "", 3000);
    if (text.length < 3) return NextResponse.json({ error: "Write a short draft first." }, { status: 400 });

    const label = field(raw.field, "Description", 80);
    const details = parseSubjectDetails(raw.details, label);
    // The draft itself decides the language; the surrounding record only breaks
    // a tie, because a one-line field may be too short to read on its own.
    const language = resolveWritingLanguage(raw.language, text, detailsText(details));

    const input = {
      field: label,
      context: field(raw.context, "KretivOS creative production", 1000),
      language,
      record: details.length ? details : undefined,
      text,
    };

    const outcome = await generateJson<ImproveResult>({
      input,
      temperature: 0.25,
      fallback: () => ({ improved: tidy(text) }),
      system: [
        "You are a precise writing editor inside KretivOS, serving a Malaysian creative and business team.",
        "Improve only the supplied field. Return JSON only with schema {improved:string}.",
        "Rewrite the writer's own draft. Never replace it with a different idea, and never answer it as if it were a question to you.",
        ...languageDirectives(language),
        ...WRITING_GUARDRAILS,
        "Make the writing clearer, more specific and directly usable by a creative team.",
        "For visual direction, prefer observable details over hype. For an exclusion list, keep it concise and comma-separated.",
        "`record` is the rest of the record this field belongs to. Use it only to stay consistent with facts already recorded — never copy it into the field.",
      ],
      validate: (parsed) => {
        const improved = String(parsed.improved || "").trim().slice(0, 3000);
        return improved.length >= 3 ? { improved } : null;
      },
    });

    return NextResponse.json({
      source: outcome.source,
      language,
      improved: enforceLanguage(outcome.value.improved, language),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to improve this writing." },
      { status: 400 },
    );
  }
}
