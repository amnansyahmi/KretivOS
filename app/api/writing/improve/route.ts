import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImproveResult = { improved: string };

function tidy(text: string) {
  const cleaned = text.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  if (!cleaned) return cleaned;
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const text = field(raw.text, "", 3000);
    if (text.length < 3) return NextResponse.json({ error: "Write a short draft first." }, { status: 400 });

    const input = {
      field: field(raw.field, "Description", 80),
      context: field(raw.context, "KretivOS creative production", 1000),
      text,
    };
    const outcome = await generateJson<ImproveResult>({
      input,
      temperature: 0.25,
      fallback: () => ({ improved: tidy(text) }),
      system: [
        "You are a precise writing editor inside KretivOS.",
        "Improve only the supplied field. Return JSON only with schema {improved:string}.",
        "Preserve the writer's language: Malay stays Malay, English stays English, and natural Malaysian mixed language may remain mixed.",
        "Keep every proper name, number, price, product detail, constraint and intended meaning accurate.",
        "Do not invent claims, certifications, ingredients, results, features, camera facts or client information.",
        "Make the writing clearer, more specific and directly usable by a creative team.",
        "Avoid corporate filler and AI-sounding language such as elevate, revolutionise, captivating, stunning, masterpiece, ultra-detailed, game-changing or world-class unless the user explicitly wrote it for a factual reason.",
        "For visual direction, prefer observable details over hype. For an exclusion list, keep it concise and comma-separated.",
        "Do not explain the edit and do not wrap it in quotation marks.",
      ],
      validate: (parsed) => {
        const improved = String(parsed.improved || "").trim().slice(0, 3000);
        return improved.length >= 3 ? { improved } : null;
      },
    });

    return NextResponse.json({ source: outcome.source, ...outcome.value });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to improve this writing." },
      { status: 400 },
    );
  }
}
