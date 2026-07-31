/**
 * Shared helper for the KretivOS structured-generation routes.
 *
 * Every generator asks ai-nonymauz-cloud for a JSON object matching a schema and
 * falls back to a deterministic starter when AI is unconfigured or unavailable,
 * so a workspace never presents the user with a dead button.
 */

import { AiMode, aiNonymauzChat } from "@/lib/ai-nonymauz";

export type GenerationOutcome<T> = { source: "ai-nonymauz-cloud" | "starter"; value: T };

/** Extracts the first JSON object from a model response, tolerating markdown fences. */
export function parseJsonObject(text: string): Record<string, any> {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object returned");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Trims and length-caps a free-text field before it reaches the model. */
export function field(value: unknown, fallback: string, max = 1000) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, max);
}

export async function generateJson<T>({
  system,
  input,
  fallback,
  validate,
  temperature = 0.35,
  mode = "normal",
  useRag = false,
  useTools = false,
}: {
  system: string[];
  input: Record<string, unknown>;
  fallback: () => T;
  validate: (parsed: Record<string, any>) => T | null;
  temperature?: number;
  mode?: AiMode;
  useRag?: boolean;
  useTools?: boolean;
}): Promise<GenerationOutcome<T>> {
  try {
    const result = await aiNonymauzChat({
      mode,
      temperature,
      useRag,
      useTools,
      systemPrompt: system.join("\n"),
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    const validated = validate(parseJsonObject(result.content));
    if (!validated) throw new Error("AI response did not match the expected schema");
    return { source: "ai-nonymauz-cloud", value: validated };
  } catch (error) {
    console.error("KretivOS generation failed", error);
    return { source: "starter", value: fallback() };
  }
}
