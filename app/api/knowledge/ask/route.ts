import { NextRequest, NextResponse } from "next/server";
import { searchKnowledge } from "@/lib/ai-context";
import { aiNonymauzChat } from "@/lib/ai-nonymauz";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Answers a question strictly from the knowledge library and returns the entries
 * it drew on, so every answer in the Knowledge workspace is traceable to a document.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = String(body.question ?? "").trim().slice(0, 500);
    if (!question) return NextResponse.json({ error: "A question is required." }, { status: 400 });

    const matches = await searchKnowledge(question, 6);

    const sources = matches.map((match, index) => ({
      index: index + 1,
      id: match.id,
      title: match.title,
      category: match.category,
      customerName: match.customerName,
    }));

    if (!matches.length) {
      return NextResponse.json({
        answer: "No knowledge entry matches that question. Add the source document to the library, or rephrase using terms that appear in it.",
        sources: [],
        source: "no-match",
      });
    }

    const context = matches
      .map((match, index) => `[${index + 1}] ${match.title}${match.customerName ? ` · ${match.customerName}` : ""} · ${match.category}\n${match.excerpt}`)
      .join("\n\n");

    const result = await aiNonymauzChat({
      mode: "normal",
      temperature: 0.2,
      useRag: false,
      useTools: false,
      systemPrompt: [
        "You answer questions about Kretivco Mediaworks using only the supplied knowledge extracts.",
        "Cite every claim with the bracket number of its source, for example [1].",
        "If the extracts do not contain the answer, say exactly what is missing instead of guessing.",
        "Never invent a figure, clause, date, client or commitment.",
        "Answer in at most four sentences unless the question needs a short list.",
        "",
        "KNOWLEDGE EXTRACTS:",
        context,
      ].join("\n"),
      messages: [{ role: "user", content: question }],
    });
    return NextResponse.json({ answer: result.content, sources, source: "ai-nonymauz-cloud", model: result.model, usage: result.usage });
  } catch (error) {
    console.error("Knowledge answer failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to answer from the knowledge library." },
      { status: 502 },
    );
  }
}
