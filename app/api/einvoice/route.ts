/**
 * LHDN MyInvois submission, status and cancellation.
 *
 * Untested against LHDN — see the note at the top of lib/einvoice.ts. Every
 * outcome is recorded on `einvoice_submissions` including the exact payload
 * sent, because LHDN validates what was submitted and the sales document may
 * since have been edited.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import {
  cancelDocument,
  cancellableUntil,
  documentStatus,
  eInvoiceConfig,
  submitInvoice,
  validationUrl,
  type EInvoiceLine,
  type EInvoiceParty,
} from "@/lib/einvoice";
import { lineAmount, type LineItem } from "@/lib/line-items";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);

function notConfigured() {
  return NextResponse.json({
    error: "MyInvois is not configured. Set MYINVOIS_CLIENT_ID, MYINVOIS_CLIENT_SECRET and MYINVOIS_SUPPLIER_TIN.",
    configured: false,
  }, { status: 503 });
}

function partyFromOrganization(row: any): EInvoiceParty {
  return {
    name: row.name,
    tin: row.tin || "",
    registrationNumber: row.registration_number || "",
    sstNumber: row.sst_number || "",
    email: row.contact_email || "",
    phone: row.contact_phone || "",
    addressLine1: row.address_line1 || "",
    addressLine2: row.address_line2 || "",
    city: row.city || "",
    stateCode: row.state_code || "",
    postcode: row.postcode || "",
    countryCode: row.country_code || "MYS",
    msicCode: row.msic_code || "",
    businessActivity: row.business_activity || "",
  };
}

function partyFromCustomer(row: any): EInvoiceParty {
  return {
    name: row.name,
    tin: row.tin || "",
    registrationNumber: row.registration_number || "",
    sstNumber: row.sst_number || "",
    identityType: row.identity_type || "",
    identityNumber: row.identity_number || "",
    email: row.email || "",
    phone: row.contact_phone || "",
    addressLine1: row.address_line1 || "",
    addressLine2: row.address_line2 || "",
    city: row.city || "",
    stateCode: row.state_code || "",
    postcode: row.postcode || "",
    countryCode: row.country_code || "MYS",
  };
}

/**
 * Fields LHDN rejects a submission for. Checked before sending so the operator
 * gets a list to fix rather than an opaque validation failure from the API.
 */
function missingRequired(supplier: EInvoiceParty, buyer: EInvoiceParty) {
  const missing: string[] = [];
  if (!supplier.tin) missing.push("Your company TIN");
  if (!supplier.registrationNumber) missing.push("Your business registration number");
  if (!supplier.msicCode) missing.push("Your MSIC code");
  if (!supplier.addressLine1 || !supplier.city || !supplier.stateCode || !supplier.postcode) missing.push("Your full business address");
  if (!buyer.tin && !buyer.identityNumber) missing.push("The customer's TIN or identity number");
  if (!buyer.addressLine1 || !buyer.city || !buyer.stateCode || !buyer.postcode) missing.push("The customer's full address");
  return missing;
}

export async function GET(request: NextRequest) {
  const config = eInvoiceConfig();
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const sql = getDatabase();
    const documentId = clean(request.nextUrl.searchParams.get("salesDocumentId"), 100);

    const rows = documentId
      ? await sql`
          select * from einvoice_submissions
          where organization_id = ${ORGANIZATION_ID} and sales_document_id = ${documentId}
          order by created_at desc
        `
      : await sql`
          select s.*, d.title, d.reference
          from einvoice_submissions s
          left join sales_documents d on d.id = s.sales_document_id
          where s.organization_id = ${ORGANIZATION_ID}
          order by s.created_at desc limit 100
        `;

    return NextResponse.json({
      configured: Boolean(config),
      environment: config?.environment ?? "sandbox",
      submissions: rows.map((row: any) => ({
        id: row.id,
        salesDocumentId: row.sales_document_id || "",
        title: row.title || "",
        internalId: row.internal_id,
        documentType: row.document_type,
        status: row.status,
        uuid: row.document_uuid,
        longId: row.long_id,
        qrUrl: row.qr_url,
        validationErrors: row.validation_errors || [],
        submittedAt: row.submitted_at,
        validatedAt: row.validated_at,
        cancellableUntil: row.cancellable_until,
        lastError: row.last_error,
        attempts: Number(row.attempts),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("e-Invoice listing failed", error);
    if (error instanceof HRAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unable to load e-Invoice submissions.";
    return NextResponse.json({
      error: /einvoice_submissions/i.test(message)
        ? "e-Invoice tables are not ready. Apply db/migrations/0009_capture_and_einvoice.sql to the Neon database."
        : message,
      configured: Boolean(config),
      submissions: [],
    }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const config = eInvoiceConfig();
    if (!config) return notConfigured();
    const body = await request.json();
    const action = clean(body.action, 40) || "submit";
    const sql = getDatabase();

    // ---- submit -----------------------------------------------------------
    if (action === "submit") {
      const salesDocumentId = clean(body.salesDocumentId, 100);
      if (!salesDocumentId) return NextResponse.json({ error: "A sales document is required." }, { status: 400 });

      const documents = await sql`
        select d.*, c.* , d.id as document_id, c.id as customer_id, d.title as document_title
        from sales_documents d join customers c on c.id = d.customer_id
        where d.id = ${salesDocumentId} and c.organization_id = ${ORGANIZATION_ID}
      `;
      if (!documents.length) return NextResponse.json({ error: "Sales document was not found." }, { status: 404 });
      const row = documents[0];

      const existing = await sql`
        select id, status from einvoice_submissions
        where sales_document_id = ${salesDocumentId} and status in ('Submitted', 'Valid')
      `;
      if (existing.length) {
        return NextResponse.json(
          { error: `This invoice has already been submitted and is ${existing[0].status}.` },
          { status: 409 },
        );
      }

      const organizations = await sql`select * from organizations where id = ${ORGANIZATION_ID}`;
      const supplier = partyFromOrganization(organizations[0] || {});
      const buyer = partyFromCustomer(row);

      const missing = missingRequired(supplier, buyer);
      if (missing.length) {
        return NextResponse.json(
          { error: "LHDN requires these before this invoice can be submitted.", missing },
          { status: 422 },
        );
      }

      // Line items live on the document's content blob, in the shape
      // lib/line-items.ts already computes for the printed invoice.
      const content = row.content && typeof row.content === "object" ? row.content : {};
      const stored: LineItem[] = Array.isArray(content.lineItems) ? content.lineItems : [];
      const taxRate = Number(content.taxRate) || 0;

      const lines: EInvoiceLine[] = stored.length
        ? stored.map((item) => {
          const amount = lineAmount(item);
          return {
            description: String(item.description || "Service"),
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            amount,
            taxAmount: Number(((amount * taxRate) / 100).toFixed(2)),
            taxRate,
            classificationCode: clean(row.classification_code, 10) || "022",
          };
        })
        : [{
          // A document without a line-item table still has a total, which LHDN
          // accepts as a single line.
          description: String(row.document_title || "Professional services"),
          quantity: 1,
          unitPrice: Number(row.value) || 0,
          amount: Number(row.value) || 0,
          taxAmount: 0,
          taxRate: 0,
          classificationCode: clean(row.classification_code, 10) || "022",
        }];

      const subtotal = Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2));
      const taxAmount = Number(lines.reduce((sum, line) => sum + line.taxAmount, 0).toFixed(2));
      const internalId = clean(row.reference, 50) || `INV-${salesDocumentId.slice(0, 8).toUpperCase()}`;

      const submission = await sql`
        insert into einvoice_submissions (
          organization_id, sales_document_id, document_type, internal_id, environment, status
        ) values (
          ${ORGANIZATION_ID}, ${salesDocumentId}, ${clean(body.documentType, 4) || "01"},
          ${internalId}, ${config.environment}, 'Draft'
        ) returning id
      `;
      const submissionId = submission[0].id;

      const result = await submitInvoice(config, {
        internalId,
        issueDate: row.issue_date ? String(row.issue_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        issueTime: new Date().toISOString().slice(11, 19) + "Z",
        currency: clean(row.currency_code, 3) || "MYR",
        exchangeRate: Number(row.exchange_rate) || 1,
        documentType: clean(body.documentType, 4) || "01",
        supplier,
        buyer,
        lines,
        subtotal,
        taxAmount,
        total: Number((subtotal + taxAmount).toFixed(2)),
      });

      if (!result.ok) {
        await sql`
          update einvoice_submissions
          set status = ${result.retryable ? "Failed" : "Invalid"},
              last_error = ${result.error},
              validation_errors = ${JSON.stringify(result.details ?? [])}::jsonb,
              attempts = attempts + 1
          where id = ${submissionId}
        `;
        return NextResponse.json(
          { error: result.error, retryable: result.retryable, details: result.details, submissionId },
          { status: result.retryable ? 503 : 422 },
        );
      }

      const accepted = result.data.acceptedDocuments[0];
      await sql`
        update einvoice_submissions set
          status = 'Submitted',
          submission_uid = ${result.data.submissionUid},
          document_uuid = ${accepted?.uuid ?? ""},
          payload = ${JSON.stringify(result.data.payload)}::jsonb,
          payload_sha256 = ${result.data.hash},
          submitted_at = now(),
          attempts = attempts + 1
        where id = ${submissionId}
      `;

      // Validation is asynchronous; the caller polls `action: "refresh"`.
      return NextResponse.json({
        ok: true,
        submissionId,
        submissionUid: result.data.submissionUid,
        uuid: accepted?.uuid ?? "",
        status: "Submitted",
        message: "Submitted to LHDN. Validation usually completes within a minute — refresh to check.",
      }, { status: 202 });
    }

    // ---- poll validation --------------------------------------------------
    if (action === "refresh") {
      const submissionId = clean(body.submissionId, 100);
      const rows = await sql`
        select * from einvoice_submissions where id = ${submissionId} and organization_id = ${ORGANIZATION_ID}
      `;
      if (!rows.length) return NextResponse.json({ error: "Submission was not found." }, { status: 404 });
      if (!rows[0].document_uuid) return NextResponse.json({ error: "This submission has no LHDN document to check." }, { status: 400 });

      const result = await documentStatus(config, rows[0].document_uuid);
      if (!result.ok) {
        await sql`update einvoice_submissions set last_error = ${result.error} where id = ${submissionId}`;
        return NextResponse.json({ error: result.error, retryable: result.retryable }, { status: 503 });
      }

      const validated = result.data.status === "Valid";
      const validatedAt = result.data.dateTimeValidated || new Date().toISOString();
      await sql`
        update einvoice_submissions set
          status = ${result.data.status},
          long_id = ${result.data.longId},
          validation_errors = ${JSON.stringify(result.data.validationErrors)}::jsonb,
          validated_at = ${validated ? validatedAt : null},
          cancellable_until = ${validated ? (cancellableUntil(validatedAt)?.toISOString() ?? null) : null},
          qr_url = ${validated ? validationUrl(config.environment, result.data.uuid, result.data.longId) : ""},
          last_error = ''
        where id = ${submissionId}
      `;
      return NextResponse.json({ ok: true, status: result.data.status, validationErrors: result.data.validationErrors });
    }

    // ---- cancel -----------------------------------------------------------
    if (action === "cancel") {
      const submissionId = clean(body.submissionId, 100);
      const reason = clean(body.reason, 300);
      const rows = await sql`
        select * from einvoice_submissions where id = ${submissionId} and organization_id = ${ORGANIZATION_ID}
      `;
      if (!rows.length) return NextResponse.json({ error: "Submission was not found." }, { status: 404 });
      if (rows[0].status !== "Valid") return NextResponse.json({ error: "Only a validated document can be cancelled." }, { status: 400 });

      // LHDN refuses cancellation after 72 hours; a credit note is the remedy
      // beyond that, so say so rather than letting the API reject it.
      if (rows[0].cancellable_until && new Date(rows[0].cancellable_until) < new Date()) {
        return NextResponse.json(
          { error: "The 72-hour cancellation window has closed. Issue a credit note instead." },
          { status: 409 },
        );
      }

      const result = await cancelDocument(config, rows[0].document_uuid, reason);
      if (!result.ok) {
        await sql`update einvoice_submissions set last_error = ${result.error} where id = ${submissionId}`;
        return NextResponse.json({ error: result.error, retryable: result.retryable }, { status: 502 });
      }

      await sql`
        update einvoice_submissions
        set status = 'Cancelled', cancelled_at = now(), cancel_reason = ${reason}, last_error = ''
        where id = ${submissionId}
      `;
      return NextResponse.json({ ok: true, status: "Cancelled" });
    }

    return NextResponse.json({ error: "Unsupported e-Invoice action." }, { status: 400 });
  } catch (error) {
    console.error("e-Invoice request failed", error);
    if (error instanceof HRAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "e-Invoice request failed." },
      { status: 500 },
    );
  }
}
