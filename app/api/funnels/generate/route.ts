import { NextRequest, NextResponse } from "next/server";

type FunnelRequest = {
  client?: string;
  name?: string;
  objective?: string;
  audience?: string;
  offer?: string;
  channels?: string;
};

type FunnelItem = {
  title: string;
  channel: string;
  format: string;
  cta: string;
};

type FunnelStage = {
  key: "TOFU" | "MOFU" | "BOFU" | "RETENTION";
  title: string;
  objective: string;
  kpi: string;
  items: FunnelItem[];
};

function fallbackStages(input: Required<FunnelRequest>): FunnelStage[] {
  const channels = input.channels || "Instagram, TikTok, Threads, Website, WhatsApp";
  return [
    {
      key: "TOFU",
      title: "Awareness",
      objective: `Introduce ${input.offer || input.name} to ${input.audience}.`,
      kpi: "Reach, video views and profile visits",
      items: [
        { title: "Problem-aware short video", channel: channels, format: "15–30 sec video", cta: "Learn more" },
        { title: "Conversation-led social post", channel: "Threads / Facebook", format: "Discussion post", cta: "Share your view" },
        { title: "Visual product introduction", channel: "Instagram / TikTok", format: "Reel or carousel", cta: "Follow for the launch" },
      ],
    },
    {
      key: "MOFU",
      title: "Consideration",
      objective: "Build trust and explain why the offer is relevant.",
      kpi: "Engagement, saves, landing-page visits and enquiries",
      items: [
        { title: "Behind-the-scenes proof", channel: "Instagram / TikTok", format: "BTS video", cta: "See how it works" },
        { title: "Benefits and comparison", channel: "Website / Social", format: "Carousel or article", cta: "Compare the options" },
        { title: "Customer or expert proof", channel: "Social / Landing page", format: "Testimonial", cta: "View the full result" },
      ],
    },
    {
      key: "BOFU",
      title: "Conversion",
      objective: `Turn qualified interest into action for ${input.offer || input.name}.`,
      kpi: "Leads, purchases, bookings or signed proposals",
      items: [
        { title: "Direct offer creative", channel: "Meta / TikTok Ads", format: "Conversion ad", cta: "Buy or book now" },
        { title: "Retargeting sequence", channel: "Meta / TikTok", format: "Retargeting ads", cta: "Complete your order" },
        { title: "WhatsApp close", channel: "WhatsApp", format: "Follow-up message", cta: "Speak to the team" },
      ],
    },
    {
      key: "RETENTION",
      title: "Retention & Referral",
      objective: "Increase repeat action, reviews and referrals.",
      kpi: "Repeat rate, reviews, referrals and customer value",
      items: [
        { title: "Post-purchase follow-up", channel: "WhatsApp / Email", format: "Message", cta: "Tell us how it went" },
        { title: "Review request", channel: "Google / Marketplace", format: "Review flow", cta: "Leave a review" },
        { title: "Next-offer sequence", channel: "Email / WhatsApp", format: "Retention offer", cta: "Order again" },
      ],
    },
  ];
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object returned");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(request: NextRequest) {
  const raw = (await request.json()) as FunnelRequest;
  const input: Required<FunnelRequest> = {
    client: String(raw.client || "Kretivco client").slice(0, 120),
    name: String(raw.name || "Marketing funnel").slice(0, 160),
    objective: String(raw.objective || "Generate qualified demand and conversion").slice(0, 1000),
    audience: String(raw.audience || "Relevant Malaysian customers").slice(0, 1000),
    offer: String(raw.offer || raw.name || "The campaign offer").slice(0, 1000),
    channels: String(raw.channels || "Instagram, TikTok, Threads, Website, WhatsApp").slice(0, 500),
  };

  const baseUrl = process.env.AI_NONYMAUZ_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.AI_NONYMAUZ_API_KEY;
  const model = process.env.AI_NONYMAUZ_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json({ source: "starter", summary: "Starter funnel created because AI is not configured.", stages: fallbackStages(input) });
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        stream: false,
        messages: [
          {
            role: "system",
            content: [
              "You are the KretivOS senior marketing strategist.",
              "Build a commercially practical full-funnel campaign for a Malaysian agency client.",
              "Return JSON only. Do not use markdown fences.",
              "Use exactly four stages in this order: TOFU, MOFU, BOFU, RETENTION.",
              "Each stage must contain 3 to 5 specific content or campaign items.",
              "Avoid generic phrases. Tie every item to the supplied client, audience, offer and channels.",
              "Schema: {summary:string, stages:[{key:'TOFU'|'MOFU'|'BOFU'|'RETENTION',title:string,objective:string,kpi:string,items:[{title:string,channel:string,format:string,cta:string}]}]}",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) throw new Error(`AI request failed with ${response.status}`);
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Invalid AI response");

    const generated = parseJson(content);
    const stages = Array.isArray(generated.stages) && generated.stages.length === 4
      ? generated.stages
      : fallbackStages(input);

    return NextResponse.json({
      source: "ai-nonymauz-cloud",
      summary: String(generated.summary || `Full funnel generated for ${input.client}.`),
      stages,
    });
  } catch (error) {
    console.error("Funnel generation failed", error);
    return NextResponse.json({
      source: "starter",
      summary: "AI was unavailable, so KretivOS created an editable starter funnel.",
      stages: fallbackStages(input),
    });
  }
}
