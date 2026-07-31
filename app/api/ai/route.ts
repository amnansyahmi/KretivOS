import { NextRequest, NextResponse } from "next/server";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  try {
    const baseUrl = process.env.AI_NONYMAUZ_BASE_URL?.replace(/\/$/, "");
    const apiKey = process.env.AI_NONYMAUZ_API_KEY;
    const model = process.env.AI_NONYMAUZ_MODEL;

    if (!baseUrl || !apiKey || !model) {
      return NextResponse.json(
        { error: "AI service is not configured. Add the ai-nonymauz-cloud environment variables." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      messages?: ChatMessage[];
      module?: string;
    };

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "Messages are required." }, { status: 400 });
    }

    const allowedMessages = body.messages
      .filter((message) => ["user", "assistant"].includes(message.role))
      .slice(-12)
      .map((message) => ({ role: message.role, content: String(message.content).slice(0, 8000) }));

    const systemMessage: ChatMessage = {
      role: "system",
      content: [
        "You are Kretivco AI, the internal executive copilot for Kretivco.",
        "Access model: shared internal Kretivco workspace with no executive role switching.",
        `Current workspace: ${body.module || "General"}.`,
        "Be concise, commercially aware, and distinguish facts from recommendations.",
        "Never claim access to company records unless relevant records are supplied by the application.",
        "For documents, produce structured professional Malaysian business content and preserve approval controls."
      ].join("\n")
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [systemMessage, ...allowedMessages],
        temperature: 0.3,
        stream: false
      }),
      signal: AbortSignal.timeout(45_000)
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("ai-nonymauz-cloud error", response.status, details.slice(0, 500));
      return NextResponse.json({ error: "The AI service could not complete this request." }, { status: 502 });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "The AI service returned an invalid response." }, { status: 502 });
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Kretivco AI route error", error);
    return NextResponse.json({ error: "Unexpected AI request failure." }, { status: 500 });
  }
}
