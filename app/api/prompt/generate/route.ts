import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PromptResult = { prompt: string; negativePrompt: string; notes: string };

/** Per-model prompting conventions, so the output is usable in the selected tool. */
const MODEL_GUIDANCE: Record<string, string> = {
  Kling: "Kling responds to a single flowing paragraph describing subject, camera movement and lighting. Keep camera direction explicit.",
  Veo: "Veo responds to cinematic language with a clear shot progression and stated lens and lighting.",
  Runway: "Runway responds to concise motion description. State the camera move first, then the subject.",
  "GPT Image": "GPT Image responds to plain descriptive sentences. Avoid camera jargon and weighting syntax.",
  Midjourney: "Midjourney responds to comma-separated descriptors ending with parameters such as --ar and --style raw.",
  Flux: "Flux responds to natural descriptive sentences with concrete photographic detail.",
};

const BASE_NEGATIVE = "synthetic texture, excessive gloss, warped or floating elements, malformed hands, distorted text, generic stock interiors, watermark, low resolution";

function starterPrompt(input: Record<string, string>): PromptResult {
  const { model, client, assetType, brief, ratio } = input;
  const suffix = model === "Midjourney" ? ` --ar ${ratio} --style raw` : "";
  return {
    prompt: `${assetType} for ${client}. ${brief} Shoot with controlled, warm lighting and shallow depth of field, preserving realistic material texture and natural imperfection. Keep the subject unmistakably identifiable throughout and finish on a clean frame with clear intent. Aspect ratio ${ratio}.${suffix}`,
    negativePrompt: BASE_NEGATIVE,
    notes: `Starter prompt built from your brief because AI is not configured. ${MODEL_GUIDANCE[model] || "Adjust the phrasing to suit the selected model."}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const model = field(raw.model, "Kling", 40);
    const input = {
      model,
      client: field(raw.client, "Kretivco client", 120),
      assetType: field(raw.assetType, "Product trailer", 80),
      brief: field(raw.brief, "A premium, realistic brand asset.", 2000),
      ratio: field(raw.ratio, "9:16", 10),
    };

    const outcome = await generateJson<PromptResult>({
      input,
      temperature: 0.45,
      fallback: () => starterPrompt(input),
      system: [
        "You are the KretivOS prompt engineer for a Malaysian creative agency.",
        `Write a production-ready prompt for the ${model} model.`,
        MODEL_GUIDANCE[model] || "Match the prompt style to the named model.",
        "Return JSON only. Do not use markdown fences.",
        "The prompt must preserve real product identity and avoid an artificial, over-rendered look.",
        "State the aspect ratio. Keep the prompt under 200 words.",
        "The negative prompt is a comma-separated list of what to avoid.",
        "Notes are one or two sentences of practical guidance for the operator.",
        "Schema: {prompt:string, negativePrompt:string, notes:string}",
      ],
      validate: (parsed) => {
        const prompt = String(parsed.prompt || "").trim();
        if (prompt.length < 40) return null;
        return {
          prompt,
          negativePrompt: String(parsed.negativePrompt || BASE_NEGATIVE),
          notes: String(parsed.notes || ""),
        };
      },
    });

    return NextResponse.json({ source: outcome.source, ...outcome.value });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate a prompt." },
      { status: 400 },
    );
  }
}
