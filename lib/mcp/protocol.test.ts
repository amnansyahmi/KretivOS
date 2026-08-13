import assert from "node:assert/strict";
import test from "node:test";
import {
  describeTools,
  handleBody,
  handleMessage,
  isNotification,
  JSON_RPC,
  LATEST_PROTOCOL_VERSION,
  negotiateProtocol,
  toolContent,
  type McpServerDefinition,
  type McpTool,
} from "./protocol.ts";

const echo: McpTool = {
  name: "echo",
  title: "Echo",
  description: "Returns what it was given.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: { value: { type: "string" }, note: { type: "string" } },
    required: ["value"],
  },
  async run(args) {
    return { data: { echoed: args.value } };
  },
};

const broken: McpTool = {
  name: "broken",
  title: "Broken",
  description: "Always throws.",
  inputSchema: { type: "object", properties: {} },
  async run() {
    throw new Error("the database is asleep");
  },
};

const refuses: McpTool = {
  name: "refuses",
  title: "Refuses",
  description: "Runs, but cannot do what was asked.",
  inputSchema: { type: "object", properties: {} },
  async run() {
    return { data: null, failed: "No customer matched \"nobody\"." };
  },
};

const server: McpServerDefinition = {
  name: "kretivos-test",
  title: "KretivOS test",
  version: "0.0.1",
  instructions: "Test server.",
  tools: [echo, broken, refuses],
};

const call = (name: string, args: Record<string, unknown> = {}, id: string | number = 1) =>
  handleMessage(server, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

test("initialize answers with a version the client asked for when we support it", async () => {
  const response: any = await handleMessage(server, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(response.result.protocolVersion, "2025-03-26");
  assert.deepEqual(response.result.serverInfo, { name: "kretivos-test", title: "KretivOS test", version: "0.0.1" });
  assert.equal(response.result.capabilities.tools.listChanged, false);
  assert.equal(response.result.instructions, "Test server.");
});

test("an unknown or missing protocol version falls back to the newest we speak", () => {
  assert.equal(negotiateProtocol("2024-11-05"), "2024-11-05");
  assert.equal(negotiateProtocol("1999-01-01"), LATEST_PROTOCOL_VERSION);
  assert.equal(negotiateProtocol(undefined), LATEST_PROTOCOL_VERSION);
});

test("notifications are never answered", async () => {
  assert.equal(isNotification({ jsonrpc: "2.0", method: "notifications/initialized" }), true);
  assert.equal(isNotification({ jsonrpc: "2.0", id: 0, method: "ping" }), false, "id 0 is still an id");
  assert.equal(await handleMessage(server, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal(await handleMessage(server, { jsonrpc: "2.0", method: "notifications/cancelled" }), null);
});

test("tools are advertised with their schema and marked read-only", () => {
  const described = describeTools(server.tools);
  assert.deepEqual(described.map((tool) => tool.name), ["echo", "broken", "refuses"]);
  assert.equal(described[0].inputSchema.required?.[0], "value");
  assert.equal(described[0].annotations.readOnlyHint, true);
  assert.equal(described[0].annotations.destructiveHint, false);
  assert.equal(described[0].annotations.openWorldHint, false, "nothing here reaches outside the workspace");
});

test("a tool call returns text content and structured content", async () => {
  const response: any = await call("echo", { value: "hello" });
  assert.equal(response.result.isError, undefined);
  assert.deepEqual(response.result.structuredContent, { echoed: "hello" });
  assert.deepEqual(JSON.parse(response.result.content[0].text), { echoed: "hello" });
});

test("an unknown tool is a protocol error that names the alternatives", async () => {
  const response: any = await call("drop_database");
  assert.equal(response.error.code, JSON_RPC.invalidParams);
  assert.match(response.error.message, /Unknown tool: drop_database/);
  assert.ok(response.error.data.available.includes("echo"));
});

test("a missing required argument is reported to the model, not thrown at the client", async () => {
  // The model is meant to read this and retry with the argument, so it comes
  // back as an errored tool result rather than a JSON-RPC error.
  const response: any = await call("echo", { note: "no value" });
  assert.equal(response.result.isError, true);
  assert.equal(response.result.content[0].text, "Missing required argument: value.");
  assert.equal(response.error, undefined);

  const blank: any = await call("echo", { value: "   " });
  assert.equal(blank.result.isError, true, "whitespace is not an argument");
});

test("a tool that throws becomes an errored result carrying the reason", async () => {
  const response: any = await call("broken");
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /the database is asleep/);
  assert.equal(response.result.structuredContent, undefined);
});

test("a tool that runs but cannot answer says so without pretending to fail hard", async () => {
  const response: any = await call("refuses");
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /No customer matched/);
});

test("unknown methods are method-not-found, and probes for other capabilities are answered empty", async () => {
  const unknown: any = await handleMessage(server, { jsonrpc: "2.0", id: 5, method: "resources/read" });
  assert.equal(unknown.error.code, JSON_RPC.methodNotFound);

  for (const [method, key] of [["resources/list", "resources"], ["prompts/list", "prompts"], ["resources/templates/list", "resourceTemplates"]] as const) {
    const response: any = await handleMessage(server, { jsonrpc: "2.0", id: 6, method });
    assert.deepEqual(response.result[key], [], `${method} answers with an empty list`);
  }

  const ping: any = await handleMessage(server, { jsonrpc: "2.0", id: 7, method: "ping" });
  assert.deepEqual(ping.result, {});
});

test("a malformed message is an invalid request rather than a crash", async () => {
  const notAnObject: any = await handleMessage(server, [] as any);
  assert.equal(notAnObject.error.code, JSON_RPC.invalidRequest);

  const noMethod: any = await handleMessage(server, { jsonrpc: "2.0", id: 8 });
  assert.equal(noMethod.error.code, JSON_RPC.invalidRequest);

  const badId: any = await handleMessage(server, { jsonrpc: "2.0", id: {}, method: "ping" });
  assert.equal(badId.error.code, JSON_RPC.invalidRequest);
  assert.equal(badId.id, null);
});

test("a batch answers only the messages that expect answers", async () => {
  const responses: any = await handleBody(server, [
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  assert.equal(responses.length, 2);
  assert.deepEqual(responses.map((response: any) => response.id), [1, 2]);

  // Nothing but notifications means no response body at all, which the
  // transport turns into 202 Accepted.
  assert.equal(await handleBody(server, [{ jsonrpc: "2.0", method: "notifications/initialized" }]), null);
  const empty: any = await handleBody(server, []);
  assert.equal(empty.error.code, JSON_RPC.invalidRequest);
});

test("an oversized payload is truncated with an instruction instead of flooding the client", () => {
  const content = toolContent({ rows: "x".repeat(80_000) });
  assert.ok(content.content[0].text.length < 61_000);
  assert.match(content.content[0].text, /truncated: ask for a narrower query/);
});

test("structured content is always an object, even when the tool returns a list", () => {
  assert.deepEqual(toolContent([1, 2]).structuredContent, { value: [1, 2] });
  assert.deepEqual(toolContent({ a: 1 }).structuredContent, { a: 1 });
});
