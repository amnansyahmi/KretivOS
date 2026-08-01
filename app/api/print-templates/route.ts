/**
 * The wording on printed quotations, invoices and receipts.
 *
 * Kept out of the code so the bank account, the payment terms and the notes can
 * change without a deployment — those change more often than the layout does.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { toCompany, toTemplate } from "@/lib/print-templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const DOCUMENT_TYPES = ["Invoice", "Quotation", "Receipt"];

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

export async function GET() {
  try {
    await requireHRSession(["hr_admin", "finance"]);
    const sql = getDatabase();
    const [templates, organizations] = await Promise.all([
      sql`select * from print_templates where organization_id = ${ORGANIZATION_ID} order by document_type`,
      sql`select * from organizations where id = ${ORGANIZATION_ID}`,
    ]);

    return NextResponse.json({
      company: toCompany(organizations[0]),
      templates: templates.map(toTemplate),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireHRSession(["hr_admin", "finance"]);
    const body = await request.json();
    const documentType = clean(body.documentType, 40);
    if (!DOCUMENT_TYPES.includes(documentType)) {
      return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
    }

    // Blank entries are dropped rather than printed as an empty numbered line.
    const notes = (Array.isArray(body.notes) ? body.notes : [])
      .map((note: unknown) => clean(note, 400))
      .filter(Boolean)
      .slice(0, 20);

    const terms = Number(body.paymentTermsDays);
    const sql = getDatabase();
    const rows = await sql`
      update print_templates set
        heading = ${clean(body.heading, 60) || documentType.toUpperCase()},
        number_label = ${clean(body.numberLabel, 60) || "No#"},
        notes = ${JSON.stringify(notes)}::jsonb,
        closing_line = ${clean(body.closingLine, 200)},
        show_signatures = ${body.showSignatures !== false},
        issued_by_label = ${clean(body.issuedByLabel, 60) || "Issued by:"},
        accepted_by_label = ${clean(body.acceptedByLabel, 60) || "Accepted by:"},
        bank_name = ${clean(body.bankName, 120)},
        bank_account_number = ${clean(body.bankAccountNumber, 60)},
        payment_terms_days = ${Number.isFinite(terms) && terms >= 0 && terms <= 365 ? Math.round(terms) : 14}
      where organization_id = ${ORGANIZATION_ID} and document_type = ${documentType}
      returning *
    `;
    if (!rows.length) return NextResponse.json({ error: "Template was not found." }, { status: 404 });

    // Bank details are shared across the three documents: an account number
    // changed on the invoice must not leave the quotation quoting the old one.
    if (body.applyBankToAll) {
      await sql`
        update print_templates set
          bank_name = ${clean(body.bankName, 120)},
          bank_account_number = ${clean(body.bankAccountNumber, 60)}
        where organization_id = ${ORGANIZATION_ID}
      `;
    }

    await sql`
      insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
      values (${ORGANIZATION_ID}, ${session.userId}, 'update', 'print_template', ${rows[0].id},
        ${JSON.stringify({ documentType })}::jsonb)
    `.catch(() => undefined);

    return NextResponse.json({ ok: true, template: toTemplate(rows[0]) });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof HRAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Print template request failed.";
  if (/print_templates|logo_url/i.test(message)) {
    return NextResponse.json(
      { error: "Print templates are not ready. Apply db/migrations/0014_print_templates.sql." },
      { status: 503 },
    );
  }
  console.error("Print template request failed", error);
  return NextResponse.json({ error: message }, { status: 500 });
}
