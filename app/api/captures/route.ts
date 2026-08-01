/**
 * Document capture: upload, extract, review.
 *
 * The image is stored first and extracted second, so a failed or unavailable
 * extraction still leaves a filed document the operator can key by hand. Nothing
 * in this route posts to the ledger — confirming a capture creates a bill
 * through /api/accounting, which is the single path into the journal.
 */

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { extractDocument, suggestAccountKey, type CaptureKind } from "@/lib/ocr";
import { suggestAccountWithAi } from "@/lib/accounting-ai";
import { duplicateFingerprint, normaliseVendor } from "@/lib/ocr-parse";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { isoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const KINDS = new Set<CaptureKind>(["receipt", "invoice", "cheque", "statement", "other"]);
/** ~6MB of base64, comfortably above a phone photo and below a request limit. */
const MAX_DOCUMENT_CHARACTERS = 8_000_000;

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function tablesMissing(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /document_captures|document_capture_lines/i.test(message);
}

function failure(error: unknown) {
  console.error("Capture request failed", error);
  if (error instanceof HRAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Capture request failed.";
  return NextResponse.json(
    {
      error: tablesMissing(error)
        ? "Capture tables are not ready. Apply db/migrations/0009_capture_and_einvoice.sql to the Neon database."
        : message,
    },
    { status: tablesMissing(error) ? 503 : 500 },
  );
}

function mapCapture(row: any) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    assetId: row.asset_id || "",
    imageUrl: row.asset_id ? `/api/captures/image/${row.asset_id}` : "",
    originalFilename: row.original_filename,
    documentDate: isoDate(row.document_date, ""),
    vendorName: row.vendor_name,
    vendorId: row.vendor_id || "",
    documentNumber: row.document_number,
    currency: row.currency,
    subtotal: row.subtotal === null ? null : Number(row.subtotal),
    taxAmount: row.tax_amount === null ? null : Number(row.tax_amount),
    total: row.total === null ? null : Number(row.total),
    chequeNumber: row.cheque_number,
    chequePayee: row.cheque_payee,
    chequeBank: row.cheque_bank,
    chequeAmountWords: row.cheque_amount_words,
    confidence: row.confidence || {},
    overallConfidence: Number(row.overall_confidence),
    extracted: row.extracted || {},
    warnings: Array.isArray(row.extracted?.warnings) ? row.extracted.warnings : [],
    duplicateOf: row.duplicate_of || "",
    billId: row.bill_id || "",
    extractionModel: row.extraction_model,
    extractionError: row.extraction_error,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const sql = getDatabase();
    const id = clean(request.nextUrl.searchParams.get("id"), 100);

    if (id) {
      const rows = await sql`
        select * from document_captures where id = ${id} and organization_id = ${ORGANIZATION_ID}
      `;
      if (!rows.length) return NextResponse.json({ error: "Capture was not found." }, { status: 404 });
      const lines = await sql`
        select * from document_capture_lines where capture_id = ${id} order by line_order
      `;
      return NextResponse.json({
        capture: mapCapture(rows[0]),
        lines: lines.map((line: any) => ({
          id: line.id, description: line.description, quantity: Number(line.quantity),
          unitPrice: Number(line.unit_price), amount: Number(line.amount),
          taxAmount: Number(line.tax_amount), suggestedAccountId: line.suggested_account_id || "",
          confidence: Number(line.confidence),
        })),
      });
    }

    const status = clean(request.nextUrl.searchParams.get("status"), 30);
    const rows = status
      ? await sql`
          select * from document_captures
          where organization_id = ${ORGANIZATION_ID} and status = ${status}
          order by created_at desc limit 200
        `
      : await sql`
          select * from document_captures
          where organization_id = ${ORGANIZATION_ID}
          order by
            -- Lowest confidence first: the queue should lead with what most
            -- needs a human, not with what arrived most recently.
            (status = 'Needs review') desc, overall_confidence asc, created_at desc
          limit 200
        `;

    return NextResponse.json({ captures: rows.map(mapCapture) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const body = await request.json();
    const action = clean(body.action, 40) || "upload";
    const sql = getDatabase();

    // ---- upload and extract ----------------------------------------------
    if (action === "upload") {
      const dataUrl = String(body.dataUrl ?? "");
      const kind = KINDS.has(body.kind) ? (body.kind as CaptureKind) : "receipt";

      if (!dataUrl) return NextResponse.json({ error: "A document image is required." }, { status: 400 });
      if (dataUrl.length > MAX_DOCUMENT_CHARACTERS) {
        return NextResponse.json({ error: "That document is too large. Photograph it again at a lower resolution." }, { status: 413 });
      }
      const match = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) return NextResponse.json({ error: "The document must be a JPEG, PNG, WEBP or PDF." }, { status: 400 });

      const assetId = randomUUID();
      const captureId = randomUUID();
      const bytes = Math.floor(match[2].length * 0.75);

      await sql.transaction([
        sql`
          insert into assets (id, organization_id, name, asset_type, category, storage_url, mime_type, file_size, metadata)
          values (
            ${assetId}, ${ORGANIZATION_ID}, ${clean(body.filename, 200) || `${kind}-${captureId}`},
            'finance_document', ${kind}, ${dataUrl}, ${match[1]}, ${bytes},
            ${JSON.stringify({ captureId, uploadedAt: new Date().toISOString() })}::jsonb
          )
        `,
        sql`
          insert into document_captures (
            id, organization_id, kind, asset_id, original_filename, mime_type, file_size, status
          ) values (
            ${captureId}, ${ORGANIZATION_ID}, ${kind}, ${assetId},
            ${clean(body.filename, 200)}, ${match[1]}, ${bytes}, 'Extracting'
          )
        `,
      ]);

      // Extraction runs inline: the operator is watching the upload, and a
      // background job would need infrastructure this deployment does not have.
      const extraction = await extractDocument({ imageDataUrl: dataUrl, kind, hint: clean(body.hint, 300) });

      if (!extraction.ok) {
        await sql`
          update document_captures
          set status = 'Failed', extraction_error = ${extraction.error},
              extraction_ms = ${extraction.durationMs}
          where id = ${captureId}
        `;
        const rows = await sql`select * from document_captures where id = ${captureId}`;
        // 200, not an error status: the document is filed and can be keyed by
        // hand, which is a usable outcome rather than a failed request.
        return NextResponse.json({
          capture: mapCapture(rows[0]),
          extractionFailed: true,
          message: `${extraction.error} The document is saved — enter the details manually.`,
        }, { status: 201 });
      }

      // Match the read vendor name against known vendors before a human looks.
      const vendors = await sql`select id, name from vendors where organization_id = ${ORGANIZATION_ID} and status = 'Active'`;
      const normalised = normaliseVendor(extraction.vendorName);
      const vendorMatch = normalised
        ? vendors.find((vendor: any) => normaliseVendor(vendor.name) === normalised)
        : undefined;

      // Same vendor, date and total as an existing capture: flag, do not block.
      const duplicates = extraction.fingerprint
        ? await sql`
            select id from document_captures
            where organization_id = ${ORGANIZATION_ID}
              and duplicate_fingerprint = ${extraction.fingerprint}
              and id <> ${captureId}
              and status not in ('Rejected', 'Duplicate')
            limit 1
          `
        : [];

      const accounts = await sql`
        select id, code, name, type, coalesce(system_key, '') as system_key from ledger_accounts
        where organization_id = ${ORGANIZATION_ID} and type = 'expense' and is_active
      `;
      const accountByKey = new Map(accounts.filter((row: any) => row.system_key).map((row: any) => [row.system_key, row.id]));

      // The keyword table answers instantly for the suppliers Kretivco actually
      // uses. The model is only consulted when that misses, so a known vendor
      // never waits on a network call, and an unknown one still gets a sensible
      // suggestion the reviewer can accept or change.
      const keywordKey = suggestAccountKey(extraction.vendorName);
      let suggestedAccountId = keywordKey === "uncategorised" ? "" : (accountByKey.get(keywordKey) ?? "");
      let suggestionSource = suggestedAccountId ? "keywords" : "none";
      let suggestionReason = "";

      if (!suggestedAccountId && extraction.vendorName) {
        const aiSuggestion = await suggestAccountWithAi({
          vendorName: extraction.vendorName,
          description: extraction.lines.map((line) => line.description).filter(Boolean).slice(0, 5).join("; "),
          accounts: accounts.map((row: any) => ({ id: row.id, code: row.code, name: row.name, type: row.type })),
        });
        if (aiSuggestion) {
          suggestedAccountId = aiSuggestion.accountId;
          suggestionSource = "ai";
          suggestionReason = aiSuggestion.reason;
        }
      }

      const statements: any[] = [
        sql`
          update document_captures set
            status = ${duplicates.length ? "Duplicate" : "Needs review"},
            extracted = ${JSON.stringify({ ...extraction, lines: undefined })}::jsonb,
            confidence = ${JSON.stringify(extraction.confidence)}::jsonb,
            overall_confidence = ${extraction.overall},
            document_date = ${extraction.documentDate},
            vendor_name = ${extraction.vendorName},
            vendor_id = ${vendorMatch?.id ?? null},
            document_number = ${extraction.documentNumber},
            currency = ${extraction.currency},
            subtotal = ${extraction.subtotal},
            tax_amount = ${extraction.taxAmount},
            total = ${extraction.total},
            cheque_number = ${extraction.chequeNumber},
            cheque_payee = ${extraction.chequePayee},
            cheque_bank = ${extraction.chequeBank},
            cheque_amount_words = ${extraction.chequeAmountWords},
            duplicate_fingerprint = ${extraction.fingerprint},
            duplicate_of = ${duplicates[0]?.id ?? null},
            extraction_model = ${extraction.model},
            extraction_ms = ${extraction.durationMs}
          where id = ${captureId}
        `,
      ];

      extraction.lines.forEach((line, index) => {
        const key = suggestAccountKey(extraction.vendorName, line.description);
        const lineAccount = accountByKey.get(key) ?? suggestedAccountId ?? accountByKey.get("uncategorised") ?? null;
        statements.push(sql`
          insert into document_capture_lines (
            capture_id, description, quantity, unit_price, amount, tax_amount,
            suggested_account_id, confidence, line_order
          ) values (
            ${captureId}, ${line.description}, ${line.quantity}, ${line.unitPrice},
            ${line.amount}, ${line.taxAmount}, ${lineAccount},
            ${line.confidence}, ${index}
          )
        `);
      });

      await sql.transaction(statements);

      const rows = await sql`select * from document_captures where id = ${captureId}`;
      return NextResponse.json({
        capture: mapCapture(rows[0]),
        suggestedAccountId,
        suggestionSource,
        suggestionReason,
        duplicate: Boolean(duplicates.length),
        warnings: extraction.warnings,
      }, { status: 201 });
    }

    // ---- corrections from the review screen -------------------------------
    if (action === "update") {
      const id = clean(body.id, 100);
      if (!id) return NextResponse.json({ error: "A capture ID is required." }, { status: 400 });
      const data = body.data && typeof body.data === "object" ? body.data : {};

      const documentDate = clean(data.documentDate, 10);
      const vendorName = clean(data.vendorName, 200);
      const total = data.total === null || data.total === "" ? null : num(data.total);

      const vendorId = clean(data.vendorId, 100);
      if (vendorId) {
        const vendors = await sql`select id from vendors where id = ${vendorId} and organization_id = ${ORGANIZATION_ID}`;
        if (!vendors.length) return NextResponse.json({ error: "Vendor was not found." }, { status: 404 });
      }

      await sql`
        update document_captures set
          vendor_name = ${vendorName},
          vendor_id = ${vendorId || null},
          document_number = ${clean(data.documentNumber, 100)},
          document_date = ${/^\d{4}-\d{2}-\d{2}$/.test(documentDate) ? documentDate : null},
          subtotal = ${data.subtotal === null || data.subtotal === "" ? null : num(data.subtotal)},
          tax_amount = ${data.taxAmount === null || data.taxAmount === "" ? null : num(data.taxAmount)},
          total = ${total},
          cheque_number = ${clean(data.chequeNumber, 50)},
          cheque_payee = ${clean(data.chequePayee, 200)},
          notes = ${clean(data.notes, 2000)},
          -- A corrected document gets a fresh fingerprint so duplicate detection
          -- reflects the reviewed values, not what the model first read.
          duplicate_fingerprint = ${duplicateFingerprint({ vendorName, documentDate, total })}
        where id = ${id} and organization_id = ${ORGANIZATION_ID}
      `;
      const rows = await sql`select * from document_captures where id = ${id} and organization_id = ${ORGANIZATION_ID}`;
      if (!rows.length) return NextResponse.json({ error: "Capture was not found." }, { status: 404 });
      return NextResponse.json({ capture: mapCapture(rows[0]) });
    }

    if (action === "reject") {
      const id = clean(body.id, 100);
      await sql`
        update document_captures
        set status = 'Rejected', notes = ${clean(body.reason, 500)}, reviewed_at = now()
        where id = ${id} and organization_id = ${ORGANIZATION_ID} and status <> 'Posted'
      `;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported capture action." }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
