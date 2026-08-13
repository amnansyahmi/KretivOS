/**
 * The KretivOS MCP endpoint: Streamable HTTP, stateless.
 *
 * Point Claude, ChatGPT, Cursor or any other MCP client at this URL and it can
 * read the workspace — pipeline, receivables, customers, projects, knowledge,
 * Brand DNA — through the tools in lib/mcp/tools.ts. See docs/MCP.md for the
 * per-client setup.
 *
 * Two decisions worth knowing before changing anything here:
 *
 * 1. It fails closed. Without KRETIVOS_MCP_TOKEN set, every request is refused.
 *    This endpoint reads real customer, financial and delivery records, and a
 *    forgotten environment variable must never be the thing standing between
 *    those records and the open internet.
 *
 * 2. It is stateless. No session is held between calls, so it survives
 *    serverless deployment where nothing outlives a request, and there is no
 *    Mcp-Session-Id to keep in step. The cost is that the server can never
 *    initiate a message, which a read-only tool server never needs to.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleBody, LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@/lib/mcp/protocol";
import { kretivosTools } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVER = {
  name: "kretivos",
  title: "KretivOS",
  version: "1.0.0",
  instructions: [
    "KretivOS is the operating system for Kretivco Mediaworks, a Malaysian creative agency: customers, sales pipeline, quotations and invoices, settlements, delivery projects, a reviewed knowledge library and per-brand Brand DNA.",
    "These tools read the live workspace. Answer from what they return, cite the record or knowledge title you used, and say when something is missing rather than estimating it.",
    "Money is Malaysian Ringgit (RM) unless a field says otherwise. Dates are calendar days in Malaysia time.",
    "Start with search_records when you only have a name, or get_business_snapshot for how the business is doing overall.",
    "Read get_brand_dna before writing anything in a client's voice, and respect its avoid list and approved claims.",
    "Nothing here can change a record. Approving, sending or editing happens in KretivOS by a person.",
  ].join("\n"),
  tools: kretivosTools,
};

/**
 * Browser-based clients (claude.ai, chatgpt.com) call this cross-origin, so the
 * preflight has to pass and the MCP headers have to be allowed through.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, x-api-key, accept",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS };

/** Constant-time comparison, so a wrong token cannot be narrowed by timing. */
function sameToken(offered: string, expected: string) {
  if (offered.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < offered.length; index += 1) {
    difference |= offered.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Finds the caller's token.
 *
 * A bearer header is the right way and what every client that can set headers
 * should use. The query parameter exists because claude.ai and ChatGPT connect
 * to a URL and cannot add one — without it those two could not connect at all.
 * A URL carrying a secret gets into browser history and server logs, so
 * docs/MCP.md says to use a separate token for them and rotate it.
 */
function offeredToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (bearer) return bearer[1].trim();
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) return apiKey.trim();
  return (request.nextUrl.searchParams.get("key") || "").trim();
}

type Denial = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

function authorize(request: NextRequest): Denial | null {
  const expected = (process.env.KRETIVOS_MCP_TOKEN || "").trim();
  if (!expected) {
    return {
      status: 503,
      body: {
        error: "The KretivOS MCP endpoint is not enabled.",
        detail: "Set KRETIVOS_MCP_TOKEN in the deployment environment to turn it on. See docs/MCP.md.",
      },
    };
  }
  if (expected.length < 24) {
    return {
      status: 503,
      body: {
        error: "The KretivOS MCP token is too short to be safe.",
        detail: "Use at least 24 characters, e.g. `openssl rand -hex 24`. See docs/MCP.md.",
      },
    };
  }

  const offered = offeredToken(request);
  if (!offered || !sameToken(offered, expected)) {
    return {
      status: 401,
      body: { error: "Unauthorized. Send the KretivOS MCP token as `Authorization: Bearer <token>`." },
      headers: { "WWW-Authenticate": 'Bearer realm="KretivOS MCP"' },
    };
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * GET is where a Streamable HTTP server would open an SSE stream. This one has
 * nothing to push, so a client asking for a stream is told so plainly, and a
 * human with curl gets something useful instead of a bare 405.
 */
export async function GET(request: NextRequest) {
  if ((request.headers.get("accept") || "").includes("text/event-stream")) {
    return NextResponse.json(
      { error: "This server does not stream. POST JSON-RPC to this same URL." },
      { status: 405, headers: { Allow: "POST, GET, OPTIONS", ...JSON_HEADERS } },
    );
  }

  const denial = authorize(request);
  const configured = !denial || denial.status === 401;
  return NextResponse.json(
    {
      name: SERVER.name,
      title: SERVER.title,
      version: SERVER.version,
      transport: "streamable-http",
      protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      enabled: configured,
      authentication: "Bearer token (Authorization header, X-API-Key, or ?key= for clients that only take a URL)",
      // The tool list is only useful to a client that can call it, and it
      // describes the business, so it stays behind the token.
      tools: denial ? undefined : SERVER.tools.length,
      docs: "https://github.com/amnansyahmi/KretivOS/blob/main/docs/MCP.md",
      ...(denial && denial.status !== 401 ? { error: denial.body.error, detail: denial.body.detail } : {}),
    },
    { headers: JSON_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  const denial = authorize(request);
  if (denial) {
    return NextResponse.json(denial.body, { status: denial.status, headers: { ...JSON_HEADERS, ...denial.headers } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "The request body is not valid JSON." } },
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const response = await handleBody(SERVER, body);

  // A body of nothing but notifications gets no JSON-RPC response at all.
  if (!response) return new NextResponse(null, { status: 202, headers: CORS });

  return NextResponse.json(response, {
    headers: {
      ...JSON_HEADERS,
      "MCP-Protocol-Version": request.headers.get("mcp-protocol-version") || LATEST_PROTOCOL_VERSION,
    },
  });
}

/** Stateless, so there is no session to end. */
export async function DELETE() {
  return NextResponse.json(
    { error: "This server is stateless and holds no session to terminate." },
    { status: 405, headers: { Allow: "POST, GET, OPTIONS", ...JSON_HEADERS } },
  );
}
