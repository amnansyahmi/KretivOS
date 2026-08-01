/**
 * Assembles one printable document: the record, the company, and the wording.
 *
 * A receipt is not a sales document in its own right here — it is the proof of
 * a payment against one — so a receipt is asked for by payment id, and the
 * document it settles supplies the customer and the job title.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { computeTotals, type LineItem } from "@/lib/line-items";
import { isoDate } from "@/lib/dates";
import { buildPrintModel, checkTotals, type PrintDocument } from "@/lib/print-templates";
import { toCompany, toTemplate } from "@/lib/print-templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";

/** Reads the priced rows off a stored document, or falls back to its header value. */
function itemsFor(row: any) {
  const content = row.content && typeof row.content === "object" ? row.content : {};
  const items: LineItem[] = Array.isArray(content.lineItems) ? content.lineItems : [];

  if (!items.length) {
    return {
      items: [{ description: row.title || "Services", quantity: 1, unit: "", unitPrice: Number(row.value) }],
      subtotal: Number(row.value),
      discountAmount: 0,
    };
  }

  const totals = computeTotals(items, {
    currency: String(content.currency || "RM"),
    taxLabel: String(content.taxLabel || "SST"),
    taxRate: Number(content.taxRate) || 0,
    discountPercent: Number(content.discountPercent) || 0,
  });
  return {
    items: items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || "",
      unitPrice: Number(item.unitPrice) || 0,
    })),
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireHRSession(["hr_admin", "finance"]);
    const { id } = await context.params;
    const kind = request.nextUrl.searchParams.get("kind") === "receipt" ? "receipt" : "document";
    const sql = getDatabase();

    const organizations = await sql`select * from organizations where id = ${ORGANIZATION_ID}`;
    const company = toCompany(organizations[0]);

    let printDocument: PrintDocument;
    let documentType: string;

    if (kind === "receipt") {
      const rows = await sql`
        select p.*, c.name as customer_name, c.address_line1, c.address_line2,
               d.title as document_title, d.reference as document_reference, d.value as document_value,
               coalesce((select sum(pa2.amount) from payment_allocations pa2
                          join payments p2 on p2.id = pa2.payment_id
                         where pa2.sales_document_id = d.id), 0) as document_allocated
        from payments p
        left join customers c on c.id = p.customer_id
        left join payment_allocations pa on pa.payment_id = p.id
        left join sales_documents d on d.id = pa.sales_document_id
        where p.id = ${id} and p.organization_id = ${ORGANIZATION_ID}
        limit 1
      `;
      if (!rows.length) return NextResponse.json({ error: "Payment was not found." }, { status: 404 });
      const row = rows[0];

      documentType = "Receipt";
      printDocument = {
        type: "Receipt",
        number: row.reference || String(row.id).slice(0, 8).toUpperCase(),
        date: isoDate(row.payment_date),
        issuedBy: session.name,
        customerName: row.customer_name || "Customer",
        customerAddressLines: [row.address_line1, row.address_line2].filter(Boolean),
        title: row.document_title || "",
        items: [{
          description: row.document_reference
            ? `Payment received for ${row.document_reference}`
            : "Payment received",
          quantity: 1, unit: "", unitPrice: Number(row.amount),
        }],
        subtotal: Number(row.amount),
        deliveryAmount: 0,
        discountAmount: 0,
        total: Number(row.amount),
        amountPaid: Number(row.amount),
        // What is still owed on the document this receipt settles, not on the
        // whole account: the client is looking at one job.
        balanceDue: Math.max(0, Number(row.document_value || 0) - Number(row.document_allocated || 0)),
        paymentMethod: row.method || "",
      };
    } else {
      const rows = await sql`
        select d.*, c.name as customer_name, c.address_line1, c.address_line2
        from sales_documents d join customers c on c.id = d.customer_id
        where d.id = ${id} and c.organization_id = ${ORGANIZATION_ID}
      `;
      if (!rows.length) return NextResponse.json({ error: "Document was not found." }, { status: 404 });
      const row = rows[0];
      const priced = itemsFor(row);
      const delivery = Number(row.delivery_amount || 0);

      documentType = String(row.type);
      printDocument = {
        type: documentType,
        number: row.reference || String(row.id).slice(0, 8).toUpperCase(),
        date: isoDate(row.issue_date ?? row.created_at),
        issuedBy: session.name,
        customerName: row.customer_name || "Customer",
        customerAddressLines: [row.address_line1, row.address_line2].filter(Boolean),
        title: row.title || "",
        items: priced.items,
        subtotal: priced.subtotal,
        deliveryAmount: delivery,
        discountAmount: priced.discountAmount,
        total: Number(row.value),
      };
    }

    const templates = await sql`
      select * from print_templates
      where organization_id = ${ORGANIZATION_ID} and document_type = ${documentType}
    `;
    if (!templates.length) {
      return NextResponse.json(
        { error: `No print template is set up for ${documentType}.` },
        { status: 404 },
      );
    }

    const model = buildPrintModel(printDocument, company, toTemplate(templates[0]));
    // Printed on the page rather than logged: a client is about to read this,
    // and an invoice whose rows do not add up to its total should say so where
    // someone will see it before it goes out.
    const check = checkTotals(printDocument);

    return NextResponse.json({
      model,
      warning: check.ok
        ? null
        : `The printed rows total ${check.expected.toFixed(2)} but this document is recorded as ${check.stored.toFixed(2)}. Check the line items before sending.`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HRAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Could not prepare the document.";
    if (/print_templates|delivery_amount|logo_url/i.test(message)) {
      return NextResponse.json(
        { error: "Print templates are not ready. Apply db/migrations/0014_print_templates.sql." },
        { status: 503 },
      );
    }
    console.error("Print request failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
