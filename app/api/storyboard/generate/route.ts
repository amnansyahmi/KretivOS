import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Scene = { shot: string; visual: string; audio: string; duration: string; camera: string };
type Storyboard = { summary: string; scenes: Scene[] };

function starterStoryboard(input: Record<string, string>): Storyboard {
  const { client, concept, product, duration, ratio } = input;
  const total = Math.max(8, Number(duration) || 20);
  const beat = Math.max(2, Math.round(total / 5));
  return {
    summary: `Editable five-beat starter storyboard for ${concept} (${client}), cut for ${ratio} at roughly ${total} seconds.`,
    scenes: [
      { shot: "Hook", visual: `Tight opening on ${product} at its most appetising moment, filling the frame within the first second.`, audio: "Percussive music start · natural production sound", duration: `${beat}s`, camera: "50mm · fast push-in" },
      { shot: "Product", visual: `Macro detail of ${product} showing real texture, so the viewer can judge quality before any claim is made.`, audio: "Sound design on the product itself", duration: `${beat}s`, camera: "85mm macro · slow drift" },
      { shot: "Experience", visual: `Real people enjoying ${product} in the ${client} setting, showing scale and social context.`, audio: "Ambient room tone · light conversation", duration: `${beat}s`, camera: "35mm wide · handheld" },
      { shot: "Offer", visual: "The offer stated plainly on screen over a clean, well-lit frame with no competing motion.", audio: "Music lifts · no voiceover over the text", duration: `${beat}s`, camera: "Locked-off" },
      { shot: "Call to action", visual: "Location, opening hours and the single next step the viewer should take.", audio: "Music resolves", duration: `${total - beat * 4}s`, camera: "Graphic frame" },
    ],
  };
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const input = {
      client: field(raw.client, "Kretivco client", 120),
      concept: field(raw.concept, "Campaign video", 300),
      product: field(raw.product, "the product", 160),
      duration: field(raw.duration, "20", 10),
      ratio: field(raw.ratio, "9:16", 10),
    };

    const outcome = await generateJson<Storyboard>({
      input,
      temperature: 0.5,
      fallback: () => starterStoryboard(input),
      system: [
        "You are the KretivOS video director for a Malaysian creative agency.",
        "Produce a shot-by-shot storyboard a small crew can actually film.",
        "Return JSON only. Do not use markdown fences.",
        "Produce between 4 and 7 scenes. Scene durations must add up to approximately the requested total duration.",
        "Every visual must be concrete and filmable. Name the subject, the framing and what moves.",
        "Do not describe abstract moods or use stock-footage language.",
        "Schema: {summary:string, scenes:[{shot:string, visual:string, audio:string, duration:string, camera:string}]}",
      ],
      validate: (parsed) => {
        const scenes = Array.isArray(parsed.scenes)
          ? parsed.scenes
              .filter((item: any) => item && typeof item.visual === "string")
              .map((item: any) => ({
                shot: String(item.shot || "Scene"),
                visual: String(item.visual),
                audio: String(item.audio || "Music bed"),
                duration: String(item.duration || "3s"),
                camera: String(item.camera || "Locked-off"),
              }))
          : [];
        if (scenes.length < 3) return null;
        return { summary: String(parsed.summary || `Storyboard for ${input.concept}.`), scenes };
      },
    });

    return NextResponse.json({ source: outcome.source, ...outcome.value });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate a storyboard." },
      { status: 400 },
    );
  }
}
