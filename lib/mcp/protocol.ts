/**
 * The Model Context Protocol wire layer.
 *
 * KretivOS already answers questions about the business through its own AI
 * routes. MCP is the other direction: it lets Claude, ChatGPT or any other MCP
 * client read the same records, so the team can ask about pipeline, receivables
 * or Brand DNA from whichever assistant they already have open.
 *
 * MCP is JSON-RPC 2.0 over a transport. This file is the protocol half —
 * framing, negotiation and dispatch — and it is deliberately free of Next.js,
 * the database and the tool list, so the rules can be tested directly. The
 * transport half lives in `app/api/mcp/route.ts` and the tools in `./tools.ts`.
 *
 * The server is stateless: every POST carries a complete request and gets a
 * complete JSON response. That rules out server-initiated messages, which this
 * server has no use for, and in exchange it survives serverless deployment
 * where nothing can be held between calls.
 */

/** Newest first. The client's choice wins when we know it. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** JSON-RPC 2.0 reserved codes, plus the MCP conventions layered on them. */
export const JSON_RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export type JsonRpcId = string | number;

export type JsonRpcMessage = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } };

export type McpToolResult = {
  /** The payload. Returned as JSON text and, for newer clients, as structured content. */
  data: unknown;
  /** Set when the tool ran but could not do what was asked. */
  failed?: string;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Every tool here reads; a future write tool must say so and be gated. */
  readOnly?: boolean;
  run: (args: Record<string, unknown>) => Promise<McpToolResult>;
};

export type McpServerDefinition = {
  name: string;
  title: string;
  version: string;
  /** Shown to the model once, at connection time. Says what this server is for. */
  instructions: string;
  tools: McpTool[];
};

export function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: value };
}

export function failure(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/** A JSON-RPC message with no id is a notification: it must not be answered. */
export function isNotification(message: JsonRpcMessage): boolean {
  return message !== null && typeof message === "object" && message.id === undefined;
}

/** Picks the protocol version to reply with, honouring the client's when known. */
export function negotiateProtocol(requested: unknown): string {
  const asked = String(requested ?? "");
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : LATEST_PROTOCOL_VERSION;
}

function params(message: JsonRpcMessage): Record<string, unknown> {
  return message.params && typeof message.params === "object" && !Array.isArray(message.params)
    ? (message.params as Record<string, unknown>)
    : {};
}

/** The tool list as the protocol describes it, without the handlers. */
export function describeTools(tools: McpTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnly !== false,
      destructiveHint: false,
      idempotentHint: true,
      // Nothing here reaches outside the workspace's own database.
      openWorldHint: false,
    },
  }));
}

/**
 * A required-argument check driven by each tool's own schema.
 *
 * Clients are supposed to validate against the schema they were given, and the
 * ones that matter do. This is the second line: a missing argument should come
 * back as "customerId is required", not as a database error.
 */
function missingArguments(tool: McpTool, args: Record<string, unknown>) {
  return (tool.inputSchema.required || []).filter((key) => {
    const value = args[key];
    return value === undefined || value === null || (typeof value === "string" && !value.trim());
  });
}

const MAX_TEXT = 60_000;

export type McpToolCallResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Wraps a tool's data in the content shape every MCP client understands. */
export function toolContent(value: unknown, failed?: string): McpToolCallResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const capped = text.length > MAX_TEXT
    ? `${text.slice(0, MAX_TEXT)}\n\n[truncated: ask for a narrower query or a smaller limit]`
    : text;

  return {
    content: [{ type: "text" as const, text: failed ? `${failed}` : capped }],
    ...(failed ? { isError: true } : { structuredContent: asStructured(value) }),
  };
}

/**
 * `structuredContent` must be an object, so a bare array or scalar is wrapped
 * rather than dropped — the text content already carries the same value.
 */
function asStructured(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

/**
 * Answers one JSON-RPC message, or returns null when the message is a
 * notification and the protocol requires silence.
 */
export async function handleMessage(
  server: McpServerDefinition,
  message: JsonRpcMessage,
): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return failure(null, JSON_RPC.invalidRequest, "A JSON-RPC 2.0 object was expected.");
  }

  const method = typeof message.method === "string" ? message.method : "";
  if (!method) {
    return isNotification(message)
      ? null
      : failure(idOf(message), JSON_RPC.invalidRequest, "The request has no method.");
  }

  // Notifications are one-way. `initialized` and `cancelled` are the ones that
  // actually arrive; anything else is still not ours to answer.
  if (isNotification(message)) return null;

  const id = idOf(message);
  if (id === null) {
    return failure(null, JSON_RPC.invalidRequest, "The request id must be a string or a number.");
  }

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: negotiateProtocol(params(message).protocolVersion),
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: { name: server.name, title: server.title, version: server.version },
        instructions: server.instructions,
      });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, { tools: describeTools(server.tools) });

    case "tools/call":
      return callTool(server, id, params(message));

    // Declared capabilities say tools only, but several clients probe these
    // anyway. An empty list is a truthful answer and keeps their UI quiet.
    case "resources/list":
      return result(id, { resources: [] });
    case "resources/templates/list":
      return result(id, { resourceTemplates: [] });
    case "prompts/list":
      return result(id, { prompts: [] });

    case "logging/setLevel":
      return result(id, {});

    default:
      return failure(id, JSON_RPC.methodNotFound, `Unknown method: ${method}`);
  }
}

async function callTool(
  server: McpServerDefinition,
  id: JsonRpcId,
  callParams: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const name = String(callParams.name ?? "");
  const tool = server.tools.find((candidate) => candidate.name === name);
  if (!tool) {
    return failure(id, JSON_RPC.invalidParams, `Unknown tool: ${name || "(none given)"}`, {
      available: server.tools.map((candidate) => candidate.name),
    });
  }

  const args = callParams.arguments && typeof callParams.arguments === "object" && !Array.isArray(callParams.arguments)
    ? (callParams.arguments as Record<string, unknown>)
    : {};

  const missing = missingArguments(tool, args);
  if (missing.length) {
    return result(id, toolContent(null, `Missing required argument${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`));
  }

  try {
    const outcome = await tool.run(args);
    return result(id, toolContent(outcome.data, outcome.failed));
  } catch (error) {
    // A failed tool is reported inside the result, not as a protocol error:
    // the call itself succeeded, and the model is meant to see why it failed
    // and choose what to do next.
    console.error(`KretivOS MCP tool ${name} failed`, error);
    return result(id, toolContent(null, error instanceof Error ? error.message : "The tool failed."));
  }
}

function idOf(message: JsonRpcMessage): JsonRpcId | null {
  return typeof message.id === "string" || typeof message.id === "number" ? message.id : null;
}

/**
 * Handles a whole request body: one message, or a batch of them.
 *
 * Batching was part of the 2025-03-26 protocol and removed in 2025-06-18.
 * Accepting an array either way costs nothing and keeps older clients working.
 * A batch of nothing but notifications produces no response at all, which the
 * transport turns into 202 Accepted.
 */
export async function handleBody(
  server: McpServerDefinition,
  body: unknown,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (!body.length) return failure(null, JSON_RPC.invalidRequest, "An empty batch is not a request.");
    const responses: JsonRpcResponse[] = [];
    for (const message of body) {
      const response = await handleMessage(server, message as JsonRpcMessage);
      if (response) responses.push(response);
    }
    return responses.length ? responses : null;
  }
  return handleMessage(server, body as JsonRpcMessage);
}
