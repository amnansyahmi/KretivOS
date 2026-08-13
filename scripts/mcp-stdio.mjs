#!/usr/bin/env node
/**
 * A stdio bridge to the KretivOS MCP endpoint.
 *
 * The endpoint at /api/mcp speaks Streamable HTTP, which is what claude.ai,
 * ChatGPT and Claude Code connect to directly. Some clients — Claude Desktop on
 * a plan without connectors, older Cursor builds, anything homegrown — only know
 * how to launch a local command and talk JSON-RPC over stdin and stdout. This is
 * that command: it reads a line-delimited JSON-RPC message, forwards it to the
 * deployment with the token attached, and writes the reply back.
 *
 * It exists so nobody has to paste a bearer token into a client that cannot send
 * one, and so there is no third-party proxy in the middle of the workspace's
 * customer and financial records.
 *
 *   KRETIVOS_MCP_URL="https://your-deployment/api/mcp" \
 *   KRETIVOS_MCP_TOKEN="…" \
 *   node scripts/mcp-stdio.mjs
 *
 * Both variables can also be passed as --url and --token. Requests are
 * forwarded one at a time, in order: MCP clients pipeline very little, and
 * keeping it sequential means a slow query cannot reorder replies.
 */

import process from "node:process";
import { createInterface } from "node:readline";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
};

const URL_ = (arg("url") || process.env.KRETIVOS_MCP_URL || "").trim().replace(/\/$/, "");
const TOKEN = (arg("token") || process.env.KRETIVOS_MCP_TOKEN || "").trim();

if (!URL_ || !TOKEN) {
  // stderr, never stdout: stdout is the protocol channel and a stray line there
  // breaks the client's parser instead of telling anyone what went wrong.
  process.stderr.write(
    "KretivOS MCP bridge: set KRETIVOS_MCP_URL and KRETIVOS_MCP_TOKEN (or pass --url and --token).\n",
  );
  process.exit(1);
}

const send = (payload) => process.stdout.write(`${JSON.stringify(payload)}\n`);

/** Mirrors a transport failure back as a JSON-RPC error, so the client sees why. */
const transportError = (id, message) =>
  send({ jsonrpc: "2.0", id: id ?? null, error: { code: -32603, message } });

async function forward(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    transportError(null, "The bridge received a line that is not valid JSON.");
    return;
  }

  const id = message && typeof message === "object" ? message.id : undefined;

  try {
    const response = await fetch(URL_, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: line,
      signal: AbortSignal.timeout(120_000),
    });

    // 202 is the endpoint acknowledging a notification. There is nothing to
    // write back, and writing anything would be a response the client never
    // asked for.
    if (response.status === 202) return;

    const text = await response.text();
    if (!response.ok) {
      transportError(id, `KretivOS MCP returned ${response.status}: ${text.slice(0, 400)}`);
      return;
    }
    if (!text.trim()) return;

    // Pass the body through verbatim rather than re-serialising it, so nothing
    // is lost or reshaped between the server and the client.
    process.stdout.write(`${text.trim()}\n`);
  } catch (error) {
    transportError(id, error instanceof Error ? error.message : "The bridge could not reach KretivOS.");
  }
}

const lines = createInterface({ input: process.stdin });
let queue = Promise.resolve();

lines.on("line", (line) => {
  if (!line.trim()) return;
  queue = queue.then(() => forward(line));
});

lines.on("close", () => {
  queue.finally(() => process.exit(0));
});
