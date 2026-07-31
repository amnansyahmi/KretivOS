import { NextRequest, NextResponse } from "next/server";
import { gatherContext } from "@/lib/ai-context";
import { AiMode, aiNonymauzChat, aiNonymauzChatStream } from "@/lib/ai-nonymauz";
import { workspaceGuidance } from "@/lib/ai-workspaces";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatRequest = {
  messages?: ChatMessage[];
  module?: string;
  grounded?: boolean;
  cloudRag?: boolean;
  useTools?: boolean;
  city?: string;
  mode?: AiMode;
  model?: string;
  stream?: boolean;
};

function buildSystemPrompt(module: string, contextBlock: string) {
  const workspace = workspaceGuidance(module);

  return [
    "You are Kretivco AI, the internal executive copilot for Kretivco Mediaworks.",
    "Access model: one shared internal workspace, no executive role switching.",
    `Current workspace: ${workspace.label}.`,
    workspace.focus,
    "Be concise and commercially aware. Separate fact from recommendation.",
    "Format answers as markdown. Use tables for figures and short bold labels for scannable lists.",
    "",
    contextBlock
      ? [
          "You have been given live company records below. Use them as the source of truth.",
          "Cite knowledge extracts by their bracket number, for example [1], immediately after the claim they support.",
          "Figures in CURRENT OPERATIONS are already calculated: quote them as given rather than recomputing.",
          "If the supplied records do not answer the question, say so plainly and state what is missing. Never invent a figure, clause, client or date.",
          "",
          contextBlock,
        ].join("\n")
      : [
          "No company records were retrieved for this question, either because nothing matched or the database is unavailable.",
          "Answer from general expertise, and say clearly that you are not reading live KretivOS records.",
        ].join("\n"),
    "",
    "For documents, produce structured professional Malaysian business content and preserve approval controls.",
  ].join("\n");
}

/** Shared preparation so the streamed and buffered paths ground identically. */
async function prepare(body: ChatRequest) {
  const allowedMessages = (body.messages || [])
    .filter((message) => ["user", "assistant"].includes(message.role))
    .slice(-12)
    .map((message) => ({ role: message.role as "user" | "assistant", content: String(message.content).slice(0, 8000) }));

  // Retrieve against the newest user turn, which is what the answer must address.
  const latestQuestion = [...allowedMessages].reverse().find((message) => message.role === "user")?.content || "";
  const module = body.module || "General";
  const context = body.grounded !== false
    ? await gatherContext(latestQuestion, { workspace: module })
    : { matches: [], snapshot: null, block: "" };

  return {
    allowedMessages,
    context,
    systemPrompt: buildSystemPrompt(module, context.block),
    meta: {
      grounded: Boolean(context.block),
      usedOperations: Boolean(context.snapshot),
      sources: context.matches.map((match, index) => ({
        index: index + 1,
        id: match.id,
        title: match.title,
        category: match.category,
        customerName: match.customerName,
      })),
    },
  };
}

export async function POST(request: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Messages are required." }, { status: 400 });
  }

  const options = {
    mode: body.mode || ("normal" as AiMode),
    model: body.model,
    temperature: 0.3,
    useRag: body.cloudRag !== false,
    useTools: body.useTools !== false,
    city: body.city,
  };

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        try {
          const { allowedMessages, systemPrompt, meta } = await prepare(body);
          // Sources go out before the first token so the citation list is on
          // screen while the answer is still being written.
          send({ type: "meta", ...meta });

          for await (const event of aiNonymauzChatStream({ messages: allowedMessages, systemPrompt, ...options })) {
            if (event.type === "delta") send({ type: "delta", text: event.text });
            else send({ type: "done", model: event.model, usage: event.usage, streamed: event.streamed });
          }
        } catch (error) {
          console.error("Kretivco AI stream error", error);
          send({ type: "error", error: "Unexpected AI request failure." });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Stops nginx-style proxies from buffering the response into one blob.
        "X-Accel-Buffering": "no",
      },
    });
  }

  try {
    const { allowedMessages, systemPrompt, meta } = await prepare(body);
    const result = await aiNonymauzChat({ messages: allowedMessages, systemPrompt, ...options });

    return NextResponse.json({
      content: result.content,
      model: result.model,
      usage: result.usage,
      ...meta,
    });
  } catch (error) {
    console.error("Kretivco AI route error", error);
    return NextResponse.json({ error: "Unexpected AI request failure." }, { status: 500 });
  }
}
