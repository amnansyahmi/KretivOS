/**
 * Typed server-side client for the deployed ai-nonymauz-cloud FastAPI service.
 *
 * The Render deployment is intentionally the default so KretivOS works with the
 * service that already exists. Environment variables can still override the URL,
 * default model or API key without exposing them to the browser.
 */

const DEFAULT_ORIGIN = "https://ai-nonymauz-cloud.onrender.com";

export type AiMode = "auto" | "fast" | "normal" | "deep" | "vision";

/**
 * Multimodal content parts, in the OpenAI-compatible shape the service expects.
 *
 * `content` was a plain string, so despite `vision` being a declared mode the
 * client physically could not send an image. Document capture needs to, so a
 * message may now carry parts instead. Plain strings still work everywhere, and
 * the two forms are interchangeable at every call site.
 */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export type AiMessage = { role: "system" | "user" | "assistant"; content: string | AiContentPart[] };

/** Builds a vision message from a data URL or an https image URL. */
export function imageMessage(prompt: string, imageUrl: string, detail: "low" | "high" | "auto" = "high"): AiMessage {
  return {
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageUrl, detail } },
    ],
  };
}
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

async function rawRequest(path: string, init?: RequestInit, timeoutMs = 60_000) {
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
  return response;
}

async function request(path: string, init?: RequestInit, timeoutMs = 60_000) {
  return (await rawRequest(path, init, timeoutMs)).json();
}

export type AiChatOptions = {
  messages: AiMessage[];
  systemPrompt?: string;
  model?: string;
  mode?: AiMode;
  temperature?: number;
  maxTokens?: number;
  useRag?: boolean;
  useTools?: boolean;
  city?: string;
};

/** The wire body is identical for streamed and buffered calls apart from `stream`. */
function completionBody(options: AiChatOptions, stream: boolean) {
  return JSON.stringify({
    model: options.model || process.env.AI_NONYMAUZ_MODEL || undefined,
    mode: options.mode ?? "normal",
    messages: options.messages,
    system_prompt: options.systemPrompt ?? "",
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    stream,
    use_rag: options.useRag !== false,
    use_tools: options.useTools !== false,
    city: options.city?.trim() || undefined,
  });
}

export async function aiNonymauzChat(options: AiChatOptions): Promise<AiCompletion> {
  const { model, mode = "normal" } = options;
  const result = await request("/v1/chat/completions", {
    method: "POST",
    body: completionBody(options, false),
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

export type AiStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; content: string; model: string; usage: AiUsage; streamed: boolean };

/** Yields decoded `data:` payloads from an SSE body, tolerating chunk boundaries mid-event. */
async function* sseFrames(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line; anything after the last one is a
      // partial event and stays buffered until the next read completes it.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (data) yield data;
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * Streams a completion, falling back to the buffered call when the deployment
 * does not actually stream. The service is an OpenAI-compatible FastAPI app, but
 * a proxy in front of it can buffer or strip SSE, and a dead chat box is worse
 * than a slow one — so any failure before the first delta retries without
 * `stream`. Failures *after* the first delta keep whatever text arrived.
 */
export async function* aiNonymauzChatStream(options: AiChatOptions): AsyncGenerator<AiStreamEvent> {
  const { model, mode = "normal" } = options;
  let content = "";
  let resolvedModel = "";
  let usage: AiUsage = {};

  try {
    const response = await rawRequest(
      "/v1/chat/completions",
      { method: "POST", body: completionBody(options, true), headers: { Accept: "text/event-stream" } },
      180_000,
    );

    if (!response.body || !(response.headers.get("content-type") || "").includes("text/event-stream")) {
      throw new Error("ai-nonymauz-cloud did not return an event stream.");
    }

    for await (const data of sseFrames(response.body)) {
      if (data === "[DONE]") break;

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // Keep-alive comments and malformed frames are not fatal.
      }

      if (parsed?.error) throw new Error(String(parsed.error?.message || parsed.error));
      if (parsed?.model) resolvedModel = String(parsed.model);
      if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;

      const choice = parsed?.choices?.[0];
      const text = choice?.delta?.content ?? choice?.message?.content;
      if (typeof text === "string" && text) {
        content += text;
        yield { type: "delta", text };
      }
    }

    if (!content) throw new Error("ai-nonymauz-cloud streamed no content.");

    yield {
      type: "done",
      content,
      model: resolvedModel || model || process.env.AI_NONYMAUZ_MODEL || mode,
      usage,
      streamed: true,
    };
    return;
  } catch (error) {
    // Text already reached the caller, so surface what we have rather than
    // replaying the whole answer through a second, contradictory request.
    if (content) {
      yield {
        type: "done",
        content,
        model: resolvedModel || model || process.env.AI_NONYMAUZ_MODEL || mode,
        usage,
        streamed: true,
      };
      return;
    }
    console.error("ai-nonymauz-cloud streaming unavailable, falling back to buffered completion", error);
  }

  const result = await aiNonymauzChat(options);
  yield { type: "delta", text: result.content };
  yield { type: "done", content: result.content, model: result.model, usage: result.usage, streamed: false };
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
