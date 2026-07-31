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
  "GPT Image": "GPT Image responds to structured natural language. Describe subject, composition, environment, lighting, material fidelity and constraints explicitly; do not use Midjourney parameters.",
  "GPT Image 2": "GPT Image 2 responds to structured natural language. Describe subject, composition, environment, lighting, material fidelity and constraints explicitly; size and quality are generation settings, not prompt switches.",
  "Midjourney V8.2": "Midjourney V8.2 responds to concise visual descriptors followed by official parameters such as --ar, --raw, --q and --s.",
  Midjourney: "Midjourney responds to concise visual descriptors followed by official parameters such as --ar, --raw, --q and --s.",
  "FLUX.2": "FLUX.2 responds to structured natural language with the most important subject and identity details first, followed by composition, lighting, materials, colours and constraints.",
  Flux: "FLUX responds to structured natural language with concrete photographic detail.",
};

const BASE_NEGATIVE = "synthetic texture, excessive gloss, warped or floating elements, malformed hands, distorted text, generic stock interiors, watermark, low resolution";
const FOOD_NEGATIVE = "plastic food surface, repeated grain patterns, cloned ingredients, waxy sauce, fake steam, impossible garnish, inflated portions, floating crumbs, excessive blur, oversharpening, HDR halos";
const SLOP_LANGUAGE = /\b(masterpiece|best quality|ultra[- ]?detailed|highly detailed|insanely detailed|award[- ]winning|trending on artstation|octane render|unreal engine|8k|16k|32k|hyperreal(?:istic)?|photoreal(?:istic|ism)?|perfectly symmetrical|flawless)\b/gi;
const VIDEO_MODELS = new Set(["Kling", "Veo", "Runway"]);

function looksLikeFood(input: Record<string, string>) {
  const text = [input.assetType, input.product, input.brief, input.style].join(" ").toLowerCase();
  return /\b(food|meal|dish|rice|pizza|pasta|bread|cake|drink|beverage|coffee|tea|sauce|paste|spice|restaurant|menu|dessert|meat|chicken|beef|fish|seafood|fruit|vegetable|nasi|ikan|ayam|daging|makanan|minuman|kuih|sambal)\b/.test(text);
}

function cleanSlopLanguage(prompt: string) {
  return prompt
    .replace(SLOP_LANGUAGE, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;])\s*\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function realismGuardrail(input: Record<string, string>, food: boolean) {
  if (food) {
    return input.realismProfile === "Balanced commercial"
      ? "Keep the supplied dish identity and recipe structure recognisably real: varied ingredient shapes, believable moisture, restrained oil sheen, natural portion density and grounded contact shadows"
      : "Food realism is strict: preserve the supplied dish identity, ingredients and recipe structure; retain irregular grain and ingredient shapes, believable moisture with restrained oil sheen, imperfect edges, natural portion density, small crumbs, real contact shadows and physically plausible plate interaction; do not substitute ingredients, redesign the dish, smooth, inflate, symmetrise or duplicate food texture";
  }
  return input.realismProfile === "Balanced commercial"
    ? "Keep materials, scale, reflections and contact shadows physically believable"
    : "Preserve small asymmetries, natural material response, plausible scale, restrained reflections and grounded contact shadows; avoid over-polished CGI symmetry and generic stock styling";
}

function insertBeforeModelParameters(prompt: string, instruction: string) {
  const parameterIndex = prompt.search(/\s--(?:ar|aspect|raw|q|quality|s|stylize|hd|v|version|no)\b/i);
  if (parameterIndex < 0) return `${prompt.replace(/[.\s]+$/, "")}. ${instruction}.`;
  const description = prompt.slice(0, parameterIndex).replace(/[.\s]+$/, "");
  return `${description}. ${instruction}.${prompt.slice(parameterIndex)}`;
}

function midjourneyNoList(avoid: string, food: boolean) {
  const defaults = food
    ? ["plastic", "wax", "cloning", "warping", "floating", "watermark", "artifacts"]
    : ["warping", "floating", "watermark", "artifacts"];
  const safeUserTerms = avoid.split(",").map((item) => item.trim()).filter((item) => /^[a-z-]+$/i.test(item));
  return [...new Set([...defaults, ...safeUserTerms])].join(", ");
}

function starterPrompt(input: Record<string, string>): PromptResult {
  const {
    model, client, brand, assetType, brief, ratio, platform, objective,
    product, audience, style, mustInclude, avoid, duration, motion,
    resolution, resolutionMode, quality, composition, lighting, camera, textInstruction,
    mjQuality, mjStylize, mjRaw, realismProfile,
  } = input;
  const isMidjourney = model.startsWith("Midjourney");
  const food = looksLikeFood(input);
  const midjourneyExclusions = midjourneyNoList(avoid, food);
  const suffix = isMidjourney
    ? ` --ar ${ratio}${mjRaw === "No" ? "" : " --raw"} --q ${mjQuality || "1"} --s ${mjStylize || "100"}${["2K", "4K delivery"].includes(resolutionMode) ? " --hd" : ""} --v 8.2 --no ${midjourneyExclusions}`
    : "";
  const videoDirection = VIDEO_MODELS.has(model)
    ? ` Duration ${duration || "10 seconds"}. Motion: ${motion || "controlled subject movement with a deliberate camera move"}.`
    : "";
  const identity = [client, brand].filter(Boolean).join(" · ");
  const basePrompt = `${assetType} for ${identity || "Kretivco client"}. Subject: ${product || "the supplied product or subject"}. Objective: ${objective || "create a clear, premium brand asset"}. Audience: ${audience || "the client's intended customer"}. Platform: ${platform || "digital campaign"}. ${brief} Composition: ${composition || "clear visual hierarchy with intentional negative space"}. Lighting: ${lighting || "controlled natural-looking light"}. Camera and lens: ${camera || "commercial photography perspective with believable optical depth"}. Visual direction: ${style || "realistic, refined and commercially usable"}. Preserve true-to-life colour and natural imperfection. ${textInstruction ? `Text handling: ${textInstruction}. ` : ""}${mustInclude ? `Must include: ${mustInclude}. ` : ""}Keep the subject unmistakably identifiable.${videoDirection} Aspect ratio ${ratio}. Output target: ${resolution || "model default"}, ${quality || "high quality"}.${suffix}`;
  return {
    prompt: VIDEO_MODELS.has(model) ? cleanSlopLanguage(basePrompt) : insertBeforeModelParameters(cleanSlopLanguage(basePrompt), realismGuardrail(input, food)),
    negativePrompt: [BASE_NEGATIVE, food ? FOOD_NEGATIVE : "", avoid].filter(Boolean).join(", "),
    notes: `Anti-slop ${food ? "food realism" : "naturalism"} guardrail applied. ${MODEL_GUIDANCE[model] || "Adjust the phrasing to suit the selected model."}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const model = field(raw.model, "Kling", 40);
    const input = {
      model,
      client: field(raw.client, "Kretivco client", 120),
      brand: field(raw.brand, "", 120),
      assetType: field(raw.assetType, "Product trailer", 80),
      brief: field(raw.brief, "A premium, realistic brand asset.", 2000),
      ratio: field(raw.ratio, "9:16", 10),
      platform: field(raw.platform, "Digital campaign", 80),
      objective: field(raw.objective, "Build interest and drive action", 160),
      product: field(raw.product, "", 180),
      audience: field(raw.audience, "", 400),
      style: field(raw.style, "", 500),
      mustInclude: field(raw.mustInclude, "", 500),
      avoid: field(raw.avoid, "", 500),
      duration: field(raw.duration, "10 seconds", 40),
      motion: field(raw.motion, "", 500),
      resolution: field(raw.resolution, "Model default", 120),
      resolutionMode: field(raw.resolutionMode, "Auto", 40),
      quality: field(raw.quality, "High", 80),
      composition: field(raw.composition, "", 300),
      lighting: field(raw.lighting, "", 300),
      camera: field(raw.camera, "", 300),
      textInstruction: field(raw.textInstruction, "No generated text unless explicitly requested", 300),
      mjQuality: field(raw.mjQuality, "1", 10),
      mjStylize: field(raw.mjStylize, "100", 10),
      mjRaw: field(raw.mjRaw, "Yes", 10),
      realismProfile: field(raw.realismProfile, "Strict natural", 40),
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
        "Never use empty prestige tokens such as masterpiece, best quality, ultra-detailed, hyperrealistic, 8K, 16K, award-winning, Unreal Engine, Octane render or trending on ArtStation. Pixel resolution belongs only in the output setting.",
        "Prefer observable photographic facts over hype: irregularity, believable material response, natural highlight roll-off, plausible gravity, contact shadow, restrained colour and credible scale.",
        "Use every useful supplied field, but do not invent product features, certifications, ingredients, prices or factual claims.",
        "For video, make subject action, camera behaviour, timing and final frame unambiguous.",
        "For images, order the prompt as subject and identity, composition, environment, lighting, camera or lens, materials and texture, colour, text handling, must-include details and exclusions.",
        "Do not confuse aspect ratio with pixel resolution. Use the supplied output target as a production setting.",
        model.startsWith("Midjourney")
          ? "End the prompt with exactly one parameter block using the supplied --ar, optional --raw, --q and --s values. Do not write pixel resolution as a Midjourney parameter."
          : "Do not use Midjourney-style double-dash parameters.",
        "State the aspect ratio. Keep the prompt under 260 words.",
        "The negative prompt is a comma-separated list of what to avoid.",
        "Notes are one or two sentences of practical guidance for the operator.",
        "Schema: {prompt:string, negativePrompt:string, notes:string}",
      ],
      validate: (parsed) => {
        const food = looksLikeFood(input);
        let prompt = cleanSlopLanguage(String(parsed.prompt || "").trim());
        if (prompt.length < 40) return null;
        if (!VIDEO_MODELS.has(model)) prompt = insertBeforeModelParameters(prompt, realismGuardrail(input, food));
        if (model.startsWith("Midjourney")) {
          if (!/--ar\s+\S+/.test(prompt)) prompt += ` --ar ${input.ratio}`;
          if (input.mjRaw !== "No" && !/(?:--raw|--style\s+raw)\b/.test(prompt)) prompt += " --raw";
          if (!/--q\s+\S+/.test(prompt)) prompt += ` --q ${input.mjQuality}`;
          if (!/--s\s+\S+/.test(prompt)) prompt += ` --s ${input.mjStylize}`;
          if (["2K", "4K delivery"].includes(input.resolutionMode) && !/--hd\b/.test(prompt)) prompt += " --hd";
          if (!/--v(?:ersion)?\s+\S+/.test(prompt)) prompt += " --v 8.2";
          if (!/--no\b/.test(prompt)) prompt += ` --no ${midjourneyNoList(input.avoid, food)}`;
        }
        const negativePrompt = [String(parsed.negativePrompt || BASE_NEGATIVE), food ? FOOD_NEGATIVE : "", input.avoid].filter(Boolean).join(", ");
        return {
          prompt,
          negativePrompt,
          notes: `Anti-slop ${food ? "food realism" : "naturalism"} guardrail applied. ${String(parsed.notes || "").trim()}`.trim(),
        };
      },
    });

    const generationSettings = model.startsWith("Midjourney")
      ? `Prompt parameters: --ar ${input.ratio}${input.mjRaw === "No" ? "" : " --raw"} --q ${input.mjQuality} --s ${input.mjStylize}${["2K", "4K delivery"].includes(input.resolutionMode) ? " --hd" : ""} --v 8.2 --no …. Aspect ratio controls shape; --hd requests the current 2K generation mode, while 4K delivery still requires an upscale/export step.`
      : `${model} settings: aspect ratio ${input.ratio}; output ${input.resolution}; quality ${input.quality}. Apply these in the target tool together with the prompt.`;

    return NextResponse.json({ source: outcome.source, ...outcome.value, generationSettings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate a prompt." },
      { status: 400 },
    );
  }
}
