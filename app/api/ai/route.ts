import { NextRequest, NextResponse } from "next/server";
import { gatherContext } from "@/lib/ai-context";
import { AiMode, aiNonymauzChat } from "@/lib/ai-nonymauz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      module?: string;
      grounded?: boolean;
      cloudRag?: boolean;
      useTools?: boolean;
      city?: string;
      mode?: AiMode;
      model?: string;
    };

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "Messages are required." }, { status: 400 });
    }

    const allowedMessages = body.messages
      .filter((message) => ["user", "assistant"].includes(message.role))
      .slice(-12)
      .map((message) => ({ role: message.role as "user" | "assistant", content: String(message.content).slice(0, 8000) }));

    // Retrieve against the newest user turn, which is what the answer must address.
    const latestQuestion = [...allowedMessages].reverse().find((message) => message.role === "user")?.content || "";
    const grounded = body.grounded !== false;
    const context = grounded
      ? await gatherContext(latestQuestion)
      : { matches: [], snapshot: null, block: "" };

    const systemMessage: ChatMessage = {
      role: "system",
      content: [
        "You are Kretivco AI, the internal executive copilot for Kretivco Mediaworks.",
        "Access model: one shared internal workspace, no executive role switching.",
        `Current workspace: ${body.module || "General"}.`,
        "Be concise and commercially aware. Separate fact from recommendation.",
        "",
        context.block
          ? [
              "You have been given live company records below. Use them as the source of truth.",
              "Cite knowledge extracts by their bracket number, for example [1], immediately after the claim they support.",
              "Figures in CURRENT OPERATIONS are already calculated: quote them as given rather than recomputing.",
              "If the supplied records do not answer the question, say so plainly and state what is missing. Never invent a figure, clause, client or date.",
              "",
              context.block,
            ].join("\n")
          : [
              "No company records were retrieved for this question, either because nothing matched or the database is unavailable.",
              "Answer from general expertise, and say clearly that you are not reading live KretivOS records.",
            ].join("\n"),
        "",
        "For documents, produce structured professional Malaysian business content and preserve approval controls.",
      ].join("\n"),
    };

    const result = await aiNonymauzChat({
      messages: allowedMessages,
      systemPrompt: systemMessage.content,
      mode: body.mode || "normal",
      model: body.model,
      temperature: 0.3,
      useRag: body.cloudRag !== false,
      useTools: body.useTools !== false,
      city: body.city,
    });

    return NextResponse.json({
      content: result.content,
      model: result.model,
      usage: result.usage,
      grounded: Boolean(context.block),
      sources: context.matches.map((match, index) => ({
        index: index + 1,
        id: match.id,
        title: match.title,
        category: match.category,
        customerName: match.customerName,
      })),
      usedOperations: Boolean(context.snapshot),
    });
  } catch (error) {
    console.error("Kretivco AI route error", error);
    return NextResponse.json({ error: "Unexpected AI request failure." }, { status: 500 });
  }
}
