import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";
import { detailsText, parseSubjectDetails, type SubjectDetail, WRITING_GUARDRAILS } from "@/lib/writing-assist";
import { enforceLanguage, languageDirectives, resolveWritingLanguage, type WritingLanguage } from "@/lib/writing-language";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GenerateResult = { generated: string };

/** Labels that usually name the thing a record is about. */
const SUBJECT_LABEL = /nama|name|tajuk|title|jenama|brand|pelanggan|customer|client|projek|project|rujukan|reference|kempen|campaign|produk|product/i;

function subjectOf(details: SubjectDetail[]) {
  return details.find((detail) => SUBJECT_LABEL.test(detail.label))?.value || details[0]?.value || "";
}

/**
 * The offline draft, used when the AI service is unreachable.
 *
 * Generate has no user text to fall back on, so instead of a dead button it
 * returns the record's own facts arranged under the field being written. That is
 * a starting point a human can edit, and it invents nothing. With nothing in the
 * record to arrange it returns "" and the route says so plainly.
 */
function starterDraft(label: string, details: SubjectDetail[], language: WritingLanguage) {
  const subject = subjectOf(details);
  if (!subject) return "";

  const malay = language !== "english";
  const supporting = details
    .filter((detail) => detail.value !== subject)
    .slice(0, 4)
    .map((detail) => `- ${detail.label}: ${detail.value}`);

  const heading = malay ? `${label} untuk ${subject}.` : `${label} for ${subject}.`;
  return [heading, ...supporting].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const label = field(raw.field, "Description", 80);
    const brief = field(raw.text, "", 1200);
    const details = parseSubjectDetails(raw.details, label);
    if (!brief && !details.length) {
      return NextResponse.json(
        { error: "Fill in a few details of this record first, then AI has something to draft from." },
        { status: 400 },
      );
    }

    // With an empty field there is nothing to read the language from, so the
    // rest of the record decides it. A Malay record must not start answering in
    // English the moment someone uses this button.
    const language = resolveWritingLanguage(raw.language, brief, detailsText(details));

    const input = {
      field: label,
      context: field(raw.context, "KretivOS creative production", 1000),
      language,
      record: details,
      brief: brief || undefined,
    };

    const outcome = await generateJson<GenerateResult>({
      input,
      temperature: 0.4,
      fallback: () => ({ generated: starterDraft(label, details, language) }),
      system: [
        "You are a senior writer inside KretivOS, serving a Malaysian creative and business team.",
        "Write the named field from scratch. Return JSON only with schema {generated:string}.",
        "`record` is a snapshot of the record this field belongs to — read it first and work out what this thing actually is, who it is for and what stage it is at. Everything you write must follow from it.",
        "`brief` is the user's rough note for this field, when there is one. Treat it as the instruction for what to write, not as text to keep word for word.",
        "Write only the field itself: no heading, no label, no options list, no commentary.",
        "Match the natural length of the field. A name, title, subject or single line stays one short line. A description is two to four sentences. A list field is one item per line.",
        ...languageDirectives(language),
        ...WRITING_GUARDRAILS,
        "Use only what the record and brief give you. Where a specific is missing, write around it or stay general — never fill the gap with a plausible number, date, price, client name or claim.",
        "If the record is too thin to say anything specific, write one short honest line rather than padding it out.",
      ],
      validate: (parsed) => {
        const generated = String(parsed.generated || "").trim().slice(0, 3000);
        return generated.length >= 3 ? { generated } : null;
      },
    });

    if (!outcome.value.generated) {
      return NextResponse.json(
        { error: "AI is unavailable right now, and this record has too little in it to draft from offline." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      source: outcome.source,
      language,
      generated: enforceLanguage(outcome.value.generated, language),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate this writing." },
      { status: 400 },
    );
  }
}
