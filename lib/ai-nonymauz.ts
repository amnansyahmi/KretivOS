/**
 * Typed server-side client for the deployed ai-nonymauz-cloud FastAPI service.
 *
 * The Render deployment is intentionally the default so KretivOS works with the
 * service that already exists. Environment variables can still override the URL,
 * default model or API key without exposing them to the browser.
 */

const DEFAULT_ORIGIN = "https://ai-nonymauz-cloud.onrender.com";

export type AiMode = "auto" | "fast" | "normal" | "deep" | "vision";
export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
};

export type AiCompletion = {
  id?: string;
  content: string;
  reasoning?: string;
  model: string;
  usage: AiUsage;
  raw: Record<string, any>;
};

function configuredOrigin() {
  const configured = process.env.AI_NONYMAUZ_BASE_URL?.trim().replace(/\/$/, "");
  return (configured || DEFAULT_ORIGIN).replace(/\/v1$/, "");
}

function headers() {
  const apiKey = process.env.AI_NONYMAUZ_API_KEY?.trim();
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function request(path: string, init?: RequestInit, timeoutMs = 60_000) {
  const response = await fetch(`${configuredOrigin()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`ai-nonymauz-cloud ${path} failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}

export async function aiNonymauzChat({
  messages,
  systemPrompt = "",
  model,
  mode = "normal",
  temperature,
  maxTokens,
  useRag = true,
  useTools = true,
  city,
}: {
  messages: AiMessage[];
  systemPrompt?: string;
  model?: string;
  mode?: AiMode;
  temperature?: number;
  maxTokens?: number;
  useRag?: boolean;
  useTools?: boolean;
  city?: string;
}): Promise<AiCompletion> {
  const result = await request("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: model || process.env.AI_NONYMAUZ_MODEL || undefined,
      mode,
      messages,
      system_prompt: systemPrompt,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      use_rag: useRag,
      use_tools: useTools,
      city: city?.trim() || undefined,
    }),
  });

  const message = result?.choices?.[0]?.message;
  if (typeof message?.content !== "string") throw new Error("ai-nonymauz-cloud returned an invalid completion.");

  return {
    id: result.id,
    content: message.content,
    reasoning: typeof message.reasoning === "string" ? message.reasoning : undefined,
    model: String(result.model || model || process.env.AI_NONYMAUZ_MODEL || mode),
    usage: result.usage && typeof result.usage === "object" ? result.usage : {},
    raw: result,
  };
}

export async function aiNonymauzStatus() {
  const started = Date.now();
  const [health, modelList, image] = await Promise.all([
    request("/health", undefined, 45_000),
    request("/v1/models", undefined, 45_000),
    request("/image/status", undefined, 45_000),
  ]);

  return {
    online: true,
    origin: configuredOrigin(),
    latencyMs: Date.now() - started,
    health,
    models: Array.isArray(modelList?.data) ? modelList.data.map((item: any) => String(item.id)).filter(Boolean) : [],
    image,
  };
}

export async function aiNonymauzImage({ prompt, style = "realistic", size = "1024x1024" }: { prompt: string; style?: string; size?: string }) {
  const result = await request("/image/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, style, size }),
  }, 90_000);

  if (typeof result?.image_base64 !== "string" || typeof result?.mime_type !== "string") {
    throw new Error("ai-nonymauz-cloud returned an invalid image.");
  }

  return {
    dataUrl: `data:${result.mime_type};base64,${result.image_base64}`,
    mimeType: result.mime_type,
    model: String(result.model || "pollinations/flux"),
    promptUsed: String(result.prompt_used || prompt),
    usageToday: Number(result.usage_today || 0),
    dailyLimit: Number(result.daily_limit || 0),
  };
}

export const aiNonymauzOrigin = configuredOrigin;
