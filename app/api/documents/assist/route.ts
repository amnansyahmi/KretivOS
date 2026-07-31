import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TemplateResult = { name: string; category: string; description: string; content: string };
type DocumentResult = { title: string; values: Record<string, string> };

function templateVariables(content: string) {
  return Array.from(new Set(Array.from(content.matchAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g)).map((match) => match[1])));
}

function cleanValues(value: unknown, allowed: string[], current: Record<string, string>, evidence = "") {
  const proposed = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(allowed.map((key) => {
    const existing = String(current[key] || "").trim();
    const generated = String(proposed[key] || "").trim().slice(0, 4000);
    if (existing) return [key, existing];
    const numericTokens = generated.match(/\d+(?:[.,]\d+)*/g) || [];
    const hasUnsupportedNumber = numericTokens.some((token) => !evidence.includes(token));
    return [key, hasUnsupportedNumber ? "" : generated];
  }));
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const action = field(raw.action, "", 40);

    if (action === "draft_template" || action === "improve_template") {
      const brief = field(raw.brief, "", 5000);
      const existing = {
        name: field(raw.template?.name, "Untitled document", 160),
        category: field(raw.template?.category, "General", 100),
        description: field(raw.template?.description, "", 1200),
        content: field(raw.template?.content, "", 20000),
      };
      if (action === "draft_template" && brief.length < 8) {
        return NextResponse.json({ error: "Add a short document brief first." }, { status: 400 });
      }

      const originalVariables = templateVariables(existing.content);
      const fallback = (): TemplateResult => action === "improve_template" ? existing : {
        name: existing.name === "Untitled document" ? "New Document" : existing.name,
        category: existing.category,
        description: brief.slice(0, 300),
        content: `# ${existing.name === "Untitled document" ? "New Document" : existing.name}\n\n## Overview\n\n{{overview}}\n\n## Details\n\n{{details}}\n\n## Next steps\n\n{{next_steps}}`,
      };

      const outcome = await generateJson<TemplateResult>({
        input: { action, brief, template: existing, requiredVariables: originalVariables },
        temperature: action === "draft_template" ? 0.35 : 0.2,
        mode: "normal",
        useRag: true,
        fallback,
        system: [
          "You are the document editor inside KretivOS, serving a Malaysian creative and business team.",
          "Return JSON only: {name:string, category:string, description:string, content:string}.",
          action === "draft_template"
            ? "Create a practical reusable Markdown document template from the brief. Use descriptive {{snake_case_variables}} only where operators must supply facts."
            : "Improve the existing reusable Markdown template for clarity, structure and professional tone without changing its factual meaning.",
          "Match the language of the brief and existing content. Natural Malaysian Malay-English mixing is allowed when it fits.",
          "Never invent prices, dates, legal terms, customer facts, statistics, approvals, guarantees, certifications or performance claims.",
          action === "improve_template"
            ? "Preserve every existing {{variable}} exactly, including its spelling. Do not rename or delete existing variables."
            : "You may replace the starter {{content}} placeholder with a useful set of descriptive variables.",
          "Use concise headings, short paragraphs, lists and tables only when they improve usability.",
          "Avoid AI-sounding filler, inflated claims and words such as elevate, revolutionise, captivating, world-class, seamless or game-changing.",
          "Do not include commentary, code fences, HTML or a signature outside the requested JSON.",
        ],
        validate: (parsed) => {
          const result = {
            name: String(parsed.name || "").trim().slice(0, 160),
            category: String(parsed.category || "").trim().slice(0, 100),
            description: String(parsed.description || "").trim().slice(0, 1200),
            content: String(parsed.content || "").trim().slice(0, 20000),
          };
          if (!result.name || !result.category || !result.content) return null;
          if (action === "improve_template") {
            const returned = new Set(templateVariables(result.content));
            if (originalVariables.some((item) => !returned.has(item))) return null;
          }
          return result;
        },
      });

      return NextResponse.json({ source: outcome.source, template: outcome.value });
    }

    if (action === "fill_document") {
      const brief = field(raw.brief, "", 6000);
      if (brief.length < 8) return NextResponse.json({ error: "Add a short document brief first." }, { status: 400 });

      const templateContent = field(raw.template?.content, "", 20000);
      const allowedVariables = templateVariables(templateContent);
      const currentValues = raw.currentValues && typeof raw.currentValues === "object"
        ? raw.currentValues as Record<string, string>
        : {};
      const currentTitle = field(raw.title, "", 200);
      const evidence = [brief, field(raw.customerName, "", 200), ...Object.values(currentValues)].join(" ");
      const fallback = (): DocumentResult => ({
        title: currentTitle || field(raw.template?.name, "New document", 160),
        values: cleanValues({}, allowedVariables, currentValues, evidence),
      });

      const outcome = await generateJson<DocumentResult>({
        input: {
          brief,
          customerName: field(raw.customerName, "Kretivco / Internal", 200),
          title: currentTitle,
          template: {
            name: field(raw.template?.name, "Document", 160),
            category: field(raw.template?.category, "General", 100),
            content: templateContent,
          },
          allowedVariables,
          currentValues,
        },
        temperature: 0.2,
        mode: "normal",
        useRag: true,
        fallback,
        system: [
          "You are an accuracy-first document assistant inside KretivOS.",
          "Return JSON only: {title:string, values:object}.",
          "Fill only the supplied allowed variables using facts explicitly present in the brief, customer name or current values.",
          "Never overwrite a non-empty current value. Never create additional keys.",
          "Never invent prices, quantities, dates, reference numbers, legal clauses, promises, statistics, results, credentials or client details. Leave unknown values as an empty string.",
          "Improve narrative fields into concise, useful business writing while preserving the user's language and intended meaning.",
          "Avoid AI-sounding filler, hype and unsupported claims.",
          "The title should be specific and short but must not introduce a new fact.",
        ],
        validate: (parsed) => {
          const title = String(parsed.title || currentTitle || "").trim().slice(0, 200);
          if (!title || !parsed.values || typeof parsed.values !== "object") return null;
          return { title, values: cleanValues(parsed.values, allowedVariables, currentValues, evidence) };
        },
      });

      return NextResponse.json({ source: outcome.source, document: outcome.value });
    }

    return NextResponse.json({ error: "Unsupported document AI action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to assist this document." },
      { status: 400 },
    );
  }
}
