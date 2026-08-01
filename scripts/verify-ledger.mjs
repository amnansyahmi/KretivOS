#!/usr/bin/env node
/**
 * Verifies that migrations 0006 to 0013 are actually applied, and that the
 * ledger they create holds together.
 *
 * Every accounting feature since PR #2 was written against a schema that had
 * never run. The posting engine, the balance trigger, the period lock and the
 * over-allocation guard are all unproven against real Postgres, and a bug in
 * any of them corrupts every report derived from the journal. This script is
 * the thing that turns "should work" into "does work".
 *
 *   node scripts/verify-ledger.mjs            schema + invariants, read-only
 *   node scripts/verify-ledger.mjs --probe    also exercises the constraints
 *
 * --probe writes into a transaction that is always rolled back, so it leaves
 * nothing behind even when it fails. It is the only way to prove the database
 * refuses what it is supposed to refuse; reading the schema only proves the
 * trigger exists, not that it fires.
 *
 * Needs DATABASE_URL. Use the direct (non-pooler) Neon hostname — the probe
 * holds a transaction open across several statements.
 *
 * Uses node-postgres rather than the @neondatabase/serverless driver the app
 * uses: this runs in Node, not on an edge runtime, and the serverless driver's
 * HTTP mode has no session, so it cannot hold the BEGIN … ROLLBACK the probe
 * depends on. Plain TCP also means the same script runs against a local
 * Postgres, which is how the migrations were checked before Neon ever saw them.
 */

import pg from "pg";
const { Pool } = pg;

const PROBE = process.argv.includes("--probe");
const ORG = process.env.KRETIVOS_ORG_ID || "org-kretivco";

const results = [];
let currentSection = "";

const section = (name) => { currentSection = name; console.log(`\n\x1b[1m${name}\x1b[0m`); };
const record = (ok, name, detail = "") => {
  results.push({ section: currentSection, ok, name, detail });
  const mark = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${mark}  ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
};

/**
 * What each migration is expected to have created. Written out by hand rather
 * than parsed from the .sql files: parsing would agree with the migration even
 * when the migration is wrong, and this list doubles as the readable spec for
 * what "applied" means.
 */
const EXPECTED = [
  {
    migration: "0006_knowledge_chunks",
    extensions: ["pg_trgm"],
    tables: ["knowledge_chunks"],
    indexes: [
      "knowledge_chunks_entry_idx", "knowledge_chunks_english_idx",
      "knowledge_chunks_simple_idx", "knowledge_chunks_trgm_idx",
      "knowledge_entries_title_trgm_idx",
    ],
  },
  {
    migration: "0007_shared_planner_projection",
    tables: ["planner_entries", "projection_scenarios"],
    indexes: ["planner_entries_date_idx", "projection_scenarios_default_idx"],
    triggers: [
      ["planner_entries", "planner_entries_set_updated_at"],
      ["projection_scenarios", "projection_scenarios_set_updated_at"],
    ],
  },
  {
    migration: "0008_accounting_core",
    tables: [
      "ledger_accounts", "fiscal_periods", "journal_entries", "journal_lines",
      "vendors", "bills", "bill_lines", "payments", "payment_allocations",
      "bank_transactions",
    ],
    functions: ["assert_journal_balanced", "assert_period_open", "validate_payment_allocation"],
    triggers: [
      ["journal_lines", "journal_lines_balanced"],
      ["journal_entries", "journal_entries_period_open"],
      ["payment_allocations", "payment_allocations_validate"],
    ],
  },
  {
    migration: "0009_capture_and_einvoice",
    tables: ["document_captures", "document_capture_lines", "einvoice_submissions"],
    columns: [
      ["organizations", "tin"], ["organizations", "registration_number"],
      ["organizations", "sst_number"], ["organizations", "msic_code"],
      ["bills", "capture_id"],
    ],
  },
  {
    migration: "0010_invoice_posting",
    columns: [
      ["sales_documents", "journal_entry_id"],
      ["sales_documents", "income_account_id"],
    ],
    indexes: ["sales_documents_journal_entry_idx"],
  },
  {
    migration: "0011_unify_cash_and_settlements",
    columns: [
      ["finance_transactions", "journal_entry_id"],
      ["finance_transactions", "bank_account_id"],
      ["finance_transactions", "ledger_account_id"],
      ["settlements", "journal_entry_id"],
      ["settlements", "bank_account_id"],
    ],
    indexes: ["finance_transactions_journal_idx", "settlements_journal_idx"],
  },
  {
    migration: "0012_payroll_posting",
    // This migration only seeds rows, so presence of the accounts is the test.
    systemKeys: ["epf_payable", "socso_payable", "pcb_payable", "employer_statutory"],
  },
  {
    migration: "0013_bank_reconciliation",
    tables: ["bank_reconciliations"],
    columns: [
      ["journal_lines", "cleared_at"],
      ["journal_lines", "reconciliation_id"],
      ["payments", "is_refund"],
    ],
    indexes: ["bank_reconciliations_account_idx", "journal_lines_cleared_idx", "payments_refund_idx"],
    functions: ["assert_reconciliation_open"],
    triggers: [["journal_lines", "journal_lines_reconciliation_open"]],
    systemKeys: ["customer_advances", "supplier_advances"],
  },
];

async function checkSchema(db) {
  // Sequential, not Promise.all: these share one client, and node-postgres
  // cannot have two queries in flight on the same connection.
  const tables = await db.query("select table_name from information_schema.tables where table_schema = 'public'");
  const indexes = await db.query("select indexname from pg_indexes where schemaname = 'public'");
  const functions = await db.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'");
  const triggers = await db.query("select c.relname as tbl, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal");
  const extensions = await db.query("select extname from pg_extension");
  const columns = await db.query("select table_name, column_name from information_schema.columns where table_schema = 'public'");

  const has = {
    table: new Set(tables.rows.map((r) => r.table_name)),
    index: new Set(indexes.rows.map((r) => r.indexname)),
    fn: new Set(functions.rows.map((r) => r.proname)),
    trigger: new Set(triggers.rows.map((r) => `${r.tbl}.${r.tgname}`)),
    ext: new Set(extensions.rows.map((r) => r.extname)),
    column: new Set(columns.rows.map((r) => `${r.table_name}.${r.column_name}`)),
  };

  const keys = await db.query(
    "select system_key from ledger_accounts where organization_id = $1 and system_key is not null",
    [ORG],
  ).catch(() => ({ rows: [] }));
  const systemKeys = new Set(keys.rows.map((r) => r.system_key));

  for (const spec of EXPECTED) {
    section(`Migration ${spec.migration}`);
    const missing = [];
    const check = (present, label) => { if (!present) missing.push(label); };

    for (const name of spec.extensions ?? []) check(has.ext.has(name), `extension ${name}`);
    for (const name of spec.tables ?? []) check(has.table.has(name), `table ${name}`);
    for (const name of spec.indexes ?? []) check(has.index.has(name), `index ${name}`);
    for (const name of spec.functions ?? []) check(has.fn.has(name), `function ${name}`);
    for (const [tbl, name] of spec.triggers ?? []) check(has.trigger.has(`${tbl}.${name}`), `trigger ${tbl}.${name}`);
    for (const [tbl, col] of spec.columns ?? []) check(has.column.has(`${tbl}.${col}`), `column ${tbl}.${col}`);
    for (const key of spec.systemKeys ?? []) check(systemKeys.has(key), `ledger account ${key}`);

    if (!missing.length) record(true, "applied");
    // A migration that created some of its objects but not all is worse than
    // one that never ran: re-running it is safe, but nothing says it needs to.
    else record(false, missing.length > 3 ? "not applied" : "partially applied", missing.join(", "));
  }
  return has;
}

async function checkInvariants(db, has) {
  section("Ledger invariants");

  if (!has.table.has("journal_lines")) {
    record(false, "skipped", "the journal does not exist yet — apply 0008 first");
    return;
  }

  const q = async (name, sql, ok, describe) => {
    const { rows } = await db.query(sql, [ORG]);
    const row = rows[0] ?? {};
    record(ok(row), name, describe(row, rows));
  };

  await q(
    "debits equal credits across the whole ledger",
    `select coalesce(sum(l.debit), 0)::float8 as debit, coalesce(sum(l.credit), 0)::float8 as credit
       from journal_lines l
       join journal_entries e on e.id = l.entry_id
      where e.organization_id = $1 and e.status = 'Posted'`,
    (r) => Math.abs(r.debit - r.credit) < 0.005,
    (r) => `debit ${r.debit.toFixed(2)}, credit ${r.credit.toFixed(2)}, difference ${(r.debit - r.credit).toFixed(2)}`,
  );

  await q(
    "no individual posted entry is unbalanced",
    `select count(*)::int as n from (
       select l.entry_id from journal_lines l
         join journal_entries e on e.id = l.entry_id
        where e.organization_id = $1 and e.status = 'Posted'
        group by l.entry_id
       having abs(sum(l.debit) - sum(l.credit)) > 0.005
     ) bad`,
    (r) => r.n === 0,
    (r) => (r.n ? `${r.n} unbalanced entries` : ""),
  );

  await q(
    "no posted entry is missing its lines",
    `select count(*)::int as n from journal_entries e
      where e.organization_id = $1 and e.status = 'Posted'
        and not exists (select 1 from journal_lines l where l.entry_id = e.id)`,
    (r) => r.n === 0,
    (r) => (r.n ? `${r.n} entries with no lines` : ""),
  );

  // The subledger and the control account are maintained by different code
  // paths, so they are the pair most likely to drift apart. sales_documents
  // carries no organisation column and no amount_paid — outstanding is the
  // document value less what payment_allocations has settled, matching how
  // lib/invoice-posting.ts computes it.
  //
  // Credit notes are subtracted, not ignored. They debit revenue and credit
  // receivables, so the control account already nets them off; counting only
  // invoices would report a shortfall the moment anyone credits a client.
  await q(
    "accounts receivable agrees with unpaid invoices",
    `select
       coalesce((select sum(l.debit - l.credit) from journal_lines l
                   join journal_entries e on e.id = l.entry_id
                   join ledger_accounts a on a.id = l.account_id
                  where e.organization_id = $1 and e.status = 'Posted'
                    and a.system_key = 'accounts_receivable'), 0)::float8 as control,
       coalesce((select sum(
                    (case when d.type = 'Credit Note' then -1 else 1 end) *
                    (d.value - coalesce(
                      (select sum(pa.amount) from payment_allocations pa
                        where pa.sales_document_id = d.id), 0)))
                   from sales_documents d
                   join customers c on c.id = d.customer_id
                  where d.type in ('Invoice', 'Credit Note')
                    and c.organization_id = $1
                    and d.journal_entry_id is not null
                    and d.status in ('Sent','Approved','Overdue','Partially paid','Paid')), 0)::float8 as subledger`,
    (r) => Math.abs(r.control - r.subledger) < 0.05,
    (r) => `control ${r.control.toFixed(2)}, documents outstanding ${r.subledger.toFixed(2)}`,
  );

  await q(
    "accounts payable agrees with unpaid bills",
    `select
       coalesce((select sum(l.credit - l.debit) from journal_lines l
                   join journal_entries e on e.id = l.entry_id
                   join ledger_accounts a on a.id = l.account_id
                  where e.organization_id = $1 and e.status = 'Posted'
                    and a.system_key = 'accounts_payable'), 0)::float8 as control,
       coalesce((select sum(b.total - coalesce(b.amount_paid, 0)) from bills b
                  where b.organization_id = $1 and b.status not in ('Void','Draft')), 0)::float8 as subledger`,
    (r) => Math.abs(r.control - r.subledger) < 0.05,
    (r) => `control ${r.control.toFixed(2)}, bills outstanding ${r.subledger.toFixed(2)}`,
  );

  await q(
    "no allocation exceeds its payment",
    `select count(*)::int as n from (
       select p.id from payments p
         join payment_allocations pa on pa.payment_id = p.id
        where p.organization_id = $1
        group by p.id, p.amount
       having sum(pa.amount) > p.amount + 0.005
     ) bad`,
    (r) => r.n === 0,
    (r) => (r.n ? `${r.n} over-allocated payments` : ""),
  );

  if (has.column.has("payments.is_refund")) {
    await q(
      "customer advances agree with unallocated receipts",
      `select
         coalesce((select sum(l.credit - l.debit) from journal_lines l
                     join journal_entries e on e.id = l.entry_id
                     join ledger_accounts a on a.id = l.account_id
                    where e.organization_id = $1 and e.status = 'Posted'
                      and a.system_key = 'customer_advances'), 0)::float8 as control,
         coalesce((select sum(p.unallocated) from payments p
                    where p.organization_id = $1 and p.direction = 'in'
                      and not p.is_refund), 0)::float8 as subledger`,
      (r) => Math.abs(r.control - r.subledger) < 0.05,
      (r) => `control ${r.control.toFixed(2)}, unallocated receipts ${r.subledger.toFixed(2)}`,
    );

    await q(
      "supplier advances agree with unallocated payments",
      `select
         coalesce((select sum(l.debit - l.credit) from journal_lines l
                     join journal_entries e on e.id = l.entry_id
                     join ledger_accounts a on a.id = l.account_id
                    where e.organization_id = $1 and e.status = 'Posted'
                      and a.system_key = 'supplier_advances'), 0)::float8 as control,
         coalesce((select sum(p.unallocated) from payments p
                    where p.organization_id = $1 and p.direction = 'out'
                      and not p.is_refund), 0)::float8 as subledger`,
      (r) => Math.abs(r.control - r.subledger) < 0.05,
      (r) => `control ${r.control.toFixed(2)}, supplier advances ${r.subledger.toFixed(2)}`,
    );
  }

  section("Records that never reached the ledger");
  const unposted = async (name, sql) => {
    const { rows } = await db.query(sql, [ORG]);
    const n = rows[0]?.n ?? 0;
    // Not a failure: it is legitimate to have records predating the posting
    // engine. It is reported because a non-zero count means the reports are
    // misstating something, and the backfill has not been run.
    record(true, `${name}: ${n}`, n ? "run the backfill before trusting reports" : "");
  };

  await unposted("issued sales documents not posted", `
    select count(*)::int as n from sales_documents d
      join customers c on c.id = d.customer_id
     where c.organization_id = $1 and d.type in ('Invoice', 'Credit Note')
       and d.status in ('Sent','Approved','Overdue','Partially paid','Paid')
       and d.journal_entry_id is null`);
  await unposted("cash movements not posted", `
    select count(*)::int as n from finance_transactions
     where $1 <> '' and journal_entry_id is null`);
  await unposted("settlements not posted", `
    select count(*)::int as n from settlements
     where $1 <> '' and journal_entry_id is null`);
}

/**
 * Proves the database refuses what it is supposed to refuse. Everything here
 * runs inside a transaction that is rolled back unconditionally.
 */
async function probe(db, has) {
  section("Constraint probes (rolled back)");

  const required = ["journal_entries", "journal_lines", "ledger_accounts"];
  if (!required.every((t) => has.table.has(t))) {
    record(false, "skipped", "apply 0008 first");
    return;
  }

  const { rows: accounts } = await db.query(
    `select id, system_key from ledger_accounts
      where organization_id = $1 and system_key in ('bank','accounts_payable','sales_income','accounts_receivable')`,
    [ORG],
  );
  const pick = (key) => accounts.find((a) => a.system_key === key)?.id;
  const bank = pick("bank");
  const payable = pick("accounts_payable");
  if (!bank || !payable) {
    record(false, "skipped", "the seeded bank / payable accounts are missing");
    return;
  }

  await db.query("begin");
  try {
    const entry = async (memo) => {
      const { rows } = await db.query(
        `insert into journal_entries (organization_id, entry_date, memo, source_type, status)
         values ($1, current_date, $2, 'manual', 'Posted') returning id`,
        [ORG, memo],
      );
      return rows[0].id;
    };
    const line = (id, account, debit, credit) => db.query(
      `insert into journal_lines (entry_id, account_id, debit, credit) values ($1, $2, $3, $4)`,
      [id, account, debit, credit],
    );

    // 1. A balanced entry must be accepted.
    await db.query("savepoint balanced");
    try {
      const id = await entry("verify-ledger balanced probe");
      await line(id, bank, 100, 0);
      await line(id, payable, 0, 100);
      // The balance trigger is deferred, so it only fires here.
      await db.query("set constraints all immediate");
      record(true, "a balanced entry posts");
    } catch (error) {
      record(false, "a balanced entry posts", error.message.split("\n")[0]);
    }
    await db.query("rollback to savepoint balanced");

    // 2. An unbalanced entry must be refused.
    await db.query("savepoint unbalanced");
    let refused = false;
    try {
      const id = await entry("verify-ledger unbalanced probe");
      await line(id, bank, 100, 0);
      await line(id, payable, 0, 60);
      await db.query("set constraints all immediate");
    } catch (error) {
      refused = /unbalanced/i.test(error.message);
    }
    record(refused, "an unbalanced entry is refused", refused ? "" : "THE BALANCE TRIGGER IS NOT FIRING");
    await db.query("rollback to savepoint unbalanced");

    // 3. A line with both sides, or neither, must be refused.
    await db.query("savepoint onesided");
    let oneSided = false;
    try {
      const id = await entry("verify-ledger one-sided probe");
      await line(id, bank, 50, 50);
    } catch (error) {
      oneSided = /journal_lines_one_sided|check constraint/i.test(error.message);
    }
    record(oneSided, "a line carrying both debit and credit is refused");
    await db.query("rollback to savepoint onesided");

    // 4. Posting into a closed period must be refused.
    if (has.table.has("fiscal_periods")) {
      await db.query("savepoint closed");
      let periodRefused = false;
      try {
        await db.query(
          `insert into fiscal_periods (organization_id, year, month, status)
           values ($1, extract(year from current_date)::int, extract(month from current_date)::int, 'Closed')
           on conflict (organization_id, year, month) do update set status = 'Closed'`,
          [ORG],
        );
        await entry("verify-ledger closed-period probe");
      } catch (error) {
        periodRefused = /closed/i.test(error.message);
      }
      record(periodRefused, "posting into a closed period is refused",
        periodRefused ? "" : "THE PERIOD LOCK IS NOT FIRING");
      await db.query("rollback to savepoint closed");
    }
  } finally {
    // Unconditional: the probe must never leave a row behind, including when
    // an assertion above threw something unexpected.
    await db.query("rollback");
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Export the direct (non-pooler) Neon connection string.");
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  try {
    const { rows } = await db.query("select current_database() as db, version() as version");
    console.log(`\x1b[2mDatabase ${rows[0].db} · organisation ${ORG}\x1b[0m`);
    console.log(`\x1b[2m${rows[0].version.split(",")[0]}\x1b[0m`);

    const has = await checkSchema(db);
    await checkInvariants(db, has);
    if (PROBE) await probe(db, has);
    else console.log("\n\x1b[2mRe-run with --probe to also exercise the constraint triggers.\x1b[0m");
  } finally {
    db.release();
    await pool.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  ${f.section} — ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("\nverify-ledger could not complete:", error.message);
  process.exit(2);
});
