import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Section = { title: string; body: string };
type Plan = { summary: string; sections: Section[] };

const SECTION_TITLES = [
  "Executive summary",
  "Market and digital audit",
  "Objectives and KPIs",
  "Audience personas",
  "Positioning and messaging",
  "TOFU / MOFU / BOFU approach",
  "Content pillars",
  "Media budget",
  "Timeline",
  "Reporting framework",
];

function starterPlan(input: Record<string, string>): Plan {
  const { client, campaign, objective, audience, budget } = input;
  return {
    summary: `Editable starter plan for ${campaign} (${client}). The objective is to ${objective.toLowerCase()} with ${audience.toLowerCase()} as the primary audience.`,
    sections: [
      { title: SECTION_TITLES[0], body: `${campaign} exists to ${objective.toLowerCase()}. Success is measured on qualified reach into ${audience} and on action taken at the point of sale.` },
      { title: SECTION_TITLES[1], body: "Audit the existing presence before spending: profile completeness, review volume and sentiment, search visibility for the local area, and which competitors already own the conversation." },
      { title: SECTION_TITLES[2], body: `Primary objective: ${objective}. Track reach and video views for awareness, saves and profile visits for consideration, and redemptions or enquiries for conversion.` },
      { title: SECTION_TITLES[3], body: `Build two or three personas from ${audience}, separating first-time triallists from repeat customers. Each persona needs its own objection to answer.` },
      { title: SECTION_TITLES[4], body: `Position ${client} on what is verifiably true and hard to copy. Lead with the specific product, not with generic quality claims.` },
      { title: SECTION_TITLES[5], body: "TOFU introduces the offer to a cold local audience. MOFU answers trust objections with proof. BOFU carries a dated, specific incentive. Retention captures reviews and the next visit." },
      { title: SECTION_TITLES[6], body: "Rotate three pillars: the product itself, the people and process behind it, and customer proof. Keep the ratio weighted toward product and proof." },
      { title: SECTION_TITLES[7], body: `Budget: ${budget}. Hold roughly 60% on conversion-intent audiences, 30% on cold reach and 10% on retargeting until data justifies a shift.` },
      { title: SECTION_TITLES[8], body: "Week 1 production and audit. Week 2 awareness launch. Week 3 consideration and proof. Week 4 conversion push and review capture." },
      { title: SECTION_TITLES[9], body: "Report weekly on spend, reach, engagement rate and redemptions. Record which creative drove action so the next campaign starts from evidence." },
    ],
  };
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const input = {
      client: field(raw.client, "Kretivco client", 120),
      campaign: field(raw.campaign, "Marketing campaign", 160),
      objective: field(raw.objective, "Generate qualified demand and conversion"),
      audience: field(raw.audience, "Relevant Malaysian customers"),
      budget: field(raw.budget, "To be confirmed", 200),
    };

    const outcome = await generateJson<Plan>({
      input,
      fallback: () => starterPlan(input),
      system: [
        "You are the KretivOS senior marketing strategist for a Malaysian agency.",
        "Write a commercially practical marketing plan the team can execute this month.",
        "Return JSON only. Do not use markdown fences.",
        `Use exactly these ten section titles, in order: ${SECTION_TITLES.join("; ")}.`,
        "Each section body is 2 to 4 sentences, specific to the supplied client, objective, audience and budget.",
        "Avoid generic marketing filler. Reference the actual offer and audience in every section.",
        "Schema: {summary:string, sections:[{title:string, body:string}]}",
      ],
      validate: (parsed) => {
        const sections = Array.isArray(parsed.sections)
          ? parsed.sections
              .filter((item: any) => item && typeof item.title === "string" && typeof item.body === "string")
              .map((item: any) => ({ title: String(item.title), body: String(item.body) }))
          : [];
        if (sections.length < 5) return null;
        return { summary: String(parsed.summary || `Marketing plan for ${input.campaign}.`), sections };
      },
    });

    return NextResponse.json({ source: outcome.source, ...outcome.value });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate a marketing plan." },
      { status: 400 },
    );
  }
}
