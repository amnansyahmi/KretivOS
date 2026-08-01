#!/usr/bin/env node
/**
 * Speaks Neon's HTTP query protocol in front of an ordinary Postgres.
 *
 * lib/db.ts uses `neon()`, the serverless HTTP driver, which only talks to a
 * Neon endpoint. That made the whole posting engine — bills, invoices, cash,
 * settlements, payroll — impossible to run anywhere except production, which
 * is why none of it had ever executed. This proxy closes that gap: point
 * DATABASE_URL at a local Postgres, set NEON_HTTP_ENDPOINT, and the unmodified
 * application runs against a throwaway database.
 *
 *   node scripts/neon-local-proxy.mjs --port 4444 \
 *     --database postgresql://postgres@localhost:5433/kretivos
 *
 * Development only. It performs no authentication and trusts the connection
 * string it was started with, ignoring the one the client sends.
 */

import { createServer } from "node:http";
import pg from "pg";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg("port", 4444));
const DATABASE = arg("database", process.env.LOCAL_DATABASE_URL);

if (!DATABASE) {
  console.error("Pass --database <postgres url> or set LOCAL_DATABASE_URL.");
  process.exit(2);
}

// Neon's driver asks for raw text and parses client-side, so every value must
// come back as the string Postgres produced. Overriding the type parsers is
// what makes numerics, dates and json arrive unmangled.
const rawText = { getTypeParser: () => (value) => value };

const pool = new pg.Pool({ connectionString: DATABASE, types: rawText, max: 10 });

const toResult = (result) => ({
  command: result.command,
  rowCount: result.rowCount,
  rows: result.rows,
  fields: (result.fields ?? []).map((f) => ({
    name: f.name,
    dataTypeID: f.dataTypeID,
    tableID: f.tableID,
    columnID: f.columnID,
    dataTypeSize: f.dataTypeSize,
    dataTypeModifier: f.dataTypeModifier,
    format: f.format,
  })),
  rowAsArray: true,
});

const server = createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405).end("Only POST is supported.");
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Body was not JSON." }));
    return;
  }

  const client = await pool.connect();
  try {
    // An array body is sql.transaction([...]): every statement runs together or
    // none of them do, which is the guarantee the posting engine relies on.
    if (Array.isArray(body.queries)) {
      const results = [];
      await client.query("begin");
      try {
        for (const item of body.queries) {
          results.push(toResult(await client.query({ text: item.query, values: item.params ?? [], rowMode: "array" })));
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ results }));
      return;
    }

    const result = await client.query({ text: body.query, values: body.params ?? [], rowMode: "array" });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(toResult(result)));
  } catch (error) {
    // Shape matters: the driver turns these fields back into a NeonDbError, so
    // application code that inspects error.code keeps working.
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      severity: error.severity,
      constraint: error.constraint,
      table: error.table,
      column: error.column,
      routine: error.routine,
    }));
  } finally {
    client.release();
  }
});

server.listen(PORT, () => {
  console.log(`Neon HTTP shim on http://localhost:${PORT} → ${DATABASE.replace(/:[^:@/]*@/, ":***@")}`);
});
