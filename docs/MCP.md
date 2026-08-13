# Connecting KretivOS to Claude, ChatGPT and other assistants

KretivOS exposes a **Model Context Protocol (MCP)** endpoint at `/api/mcp`. MCP
is the open standard assistants use to read outside systems, so pointing Claude,
ChatGPT, Cursor or anything else that speaks it at this URL lets the team ask
about the business from whichever assistant is already open:

> Which invoices are overdue, and who do I chase first?
> What is the Brand DNA for Kedai Kek Ratu? Draft an Instagram caption in that voice.
> Summarise Chef Ammar: open opportunities, unpaid documents, live projects.

The endpoint reads the same Neon records the workspace does, so an assistant and
the app can never describe the same day differently.

## What it can and cannot do

**It can only read.** There is no tool that creates, edits, approves, sends or
deletes anything. Approving a quotation, issuing an invoice and editing a record
stay in KretivOS, done by a person. An assistant that has been talked into
something cannot act on it here.

| Tool | Answers |
| --- | --- |
| `search_records` | Customers, opportunities, sales documents, projects and knowledge, matched by name, reference or title |
| `get_business_snapshot` | Pipeline, receivables, settlements, delivery, cleared cash and what needs attention |
| `search_knowledge` | Passages from the knowledge library with owner and review status |
| `list_customers` | Customer records, filtered by status or industry |
| `get_customer` | One customer in full: contacts, brands, opportunities, documents, settlements, projects |
| `list_sales_documents` | Quotations, invoices and the rest, by type, status or customer, with overdue flags |
| `list_projects` | Delivery projects with progress, owner, budget, task counts and overdue flags |
| `get_brand_dna` | The reviewed brand profile, including the approved claims and the avoid list |

Money is Malaysian Ringgit. Every tool caps its own result size, so a broad
question comes back trimmed rather than flooding the assistant.

## 1. Turn it on

The endpoint **fails closed**: with no token configured it refuses every
request, including its own tool list. A forgotten environment variable must
never be the only thing between customer and financial records and the internet.

Generate a token and set it in the deployment environment:

```bash
openssl rand -hex 24
```

```bash
# Vercel → Project → Settings → Environment Variables, or:
vercel env add KRETIVOS_MCP_TOKEN production
```

Locally, add it to `.env.local`. Tokens shorter than 24 characters are rejected
rather than quietly accepted.

Check it is live — this needs no token and returns no business data:

```bash
curl https://your-deployment.vercel.app/api/mcp
```

```json
{ "name": "kretivos", "transport": "streamable-http", "enabled": true, "…": "…" }
```

## 2. Connect a client

The URL is `https://your-deployment.vercel.app/api/mcp`.

Two ways to authenticate, and which one you use depends on the client:

- **`Authorization: Bearer <token>`** — correct, and what every client that can
  set headers should use.
- **`?key=<token>` on the URL** — for claude.ai and ChatGPT, which connect to a
  URL and give you nowhere to put a header. A URL carrying a secret ends up in
  browser history and server logs, so issue a **separate token** for these, and
  rotate it when someone leaves. Prefer the header wherever you have the choice.

### Claude Code

```bash
claude mcp add --transport http kretivos https://your-deployment.vercel.app/api/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

Or commit the project form to `.mcp.json` (put the token in the environment, not
in the file, if the repo is shared):

```json
{
  "mcpServers": {
    "kretivos": {
      "type": "http",
      "url": "https://your-deployment.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

### Cursor, Windsurf and similar editors

`~/.cursor/mcp.json` (or the editor's equivalent):

```json
{
  "mcpServers": {
    "kretivos": {
      "url": "https://your-deployment.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

### claude.ai and Claude Desktop

Settings → **Connectors** → add a custom connector, and paste:

```
https://your-deployment.vercel.app/api/mcp?key=YOUR_TOKEN
```

Custom connectors are a paid-plan feature and Anthropic moves the menu around,
so the exact wording may differ from the above. If your plan or build has no
custom-connector option, use the stdio bridge below with Claude Desktop.

### ChatGPT

Settings → **Connectors** (developer mode) → add an MCP server, transport
**HTTP/Streamable**, authentication **none**, and paste the same
`…/api/mcp?key=YOUR_TOKEN` URL. Availability depends on your ChatGPT plan.

### Anything that only speaks stdio

`scripts/mcp-stdio.mjs` is a small bridge — it reads JSON-RPC on stdin, forwards
it to the endpoint with the token attached, and writes the reply to stdout. It
keeps the token in your own config instead of a third-party proxy:

```json
{
  "mcpServers": {
    "kretivos": {
      "command": "node",
      "args": ["/absolute/path/to/KretivOS/scripts/mcp-stdio.mjs"],
      "env": {
        "KRETIVOS_MCP_URL": "https://your-deployment.vercel.app/api/mcp",
        "KRETIVOS_MCP_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

That is the shape Claude Desktop's `claude_desktop_config.json` wants. It needs
Node 22, which the project already requires.

## 3. Check it by hand

Anything that speaks HTTP can drive the endpoint, which makes debugging a
connector a two-line job rather than a guess:

```bash
URL="https://your-deployment.vercel.app/api/mcp"
AUTH="Authorization: Bearer YOUR_TOKEN"

# What tools exist?
curl -s "$URL" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# How is the business doing?
curl -s "$URL" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_business_snapshot","arguments":{}}}'
```

| Symptom | Cause |
| --- | --- |
| `503` "not enabled" | `KRETIVOS_MCP_TOKEN` is unset in that environment. Vercel needs a redeploy after adding it. |
| `503` "too short" | The token is under 24 characters. |
| `401` | The token does not match. Check for a trailing newline when it was copied. |
| `405` on GET | Expected: the client asked for an SSE stream and this server does not stream. Requests go to POST on the same URL. |
| Tools listed but every call errors | `DATABASE_URL` is not reachable from that deployment. |

## How it works

- `app/api/mcp/route.ts` — the transport. Streamable HTTP, stateless: every POST
  carries a whole request and gets a whole JSON response, so it survives
  serverless deployment where nothing lives between calls. It handles auth, CORS
  for browser-based clients, and JSON-RPC batches from older clients.
- `lib/mcp/protocol.ts` — the protocol: framing, version negotiation, dispatch,
  and the rule that a tool failure is reported *inside* the result so the model
  can see why and choose what to do next. Covered by `lib/mcp/protocol.test.ts`.
- `lib/mcp/tools.ts` — the tools. The queries mirror the workspace routes rather
  than inventing a second view of the data.

Protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05` are all accepted;
the client's choice is honoured when we know it.

### Adding a tool

Append to `kretivosTools` in `lib/mcp/tools.ts`: a `name`, a `title`, a
`description` written for a model rather than a developer, a JSON Schema for the
arguments, and a `run` that returns `{ data }` — or `{ data: null, failed: "…" }`
when it ran but could not answer. `tools/list` picks it up with no other change.

A tool that **writes** is a different decision, not a bigger version of this
one. Mark it `readOnly: false`, put it behind its own environment flag so
read-only stays the default, and keep approval and sending in the workspace
where a person does it.
