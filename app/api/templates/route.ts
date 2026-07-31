import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => clean(value) || null;
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];

const STARTER_TEMPLATES = [
  {
    id: "tpl-proposal",
    name: "Kretivco Marketing Proposal",
    category: "Proposal",
    description: "Campaign proposal using the approved Kretivco proposal identity.",
    layout: "proposal",
    content: `# CADANGAN KEMPEN PEMASARAN

**Reference No.:** {{reference_no}}  
**Tarikh:** {{date}}  
**Untuk:** {{client_name}}  
**Daripada:** Kretivco Mediaworks  
**Perkara:** {{subject}}  
**Tempoh Kempen:** {{campaign_period}}

## 1. Ringkasan Cadangan

{{executive_summary}}

## 2. Apa Yang Kami Perhatikan

{{observations}}

## 3. Objektif

{{objectives}}

## 4. Strategi Kempen

{{strategy}}

## 5. Skop Kerja Kretivco

{{scope}}

## 6. Bajet dan Pelaburan

**Yuran Kretivco:** {{management_fee}}  
**Bajet media:** {{media_budget}}  
**Jumlah:** {{total_investment}}

## 7. Jadual Pelaksanaan

{{timeline}}`,
  },
  {
    id: "tpl-quotation",
    name: "Quotation",
    category: "Sales",
    description: "Commercial quotation with scope, pricing and validity.",
    layout: "commercial",
    content: `# QUOTATION

**Quotation No.:** {{quotation_no}}  
**Date:** {{date}}  
**Prepared for:** {{client_name}}  
**Project:** {{project_name}}

## Scope

{{scope}}

## Commercial Summary

{{line_items}}

**Subtotal:** {{subtotal}}  
**Tax / SST:** {{tax}}  
**Total:** {{total}}

## Terms

{{terms}}

**Valid until:** {{valid_until}}`,
  },
  {
    id: "tpl-invoice",
    name: "Invoice",
    category: "Finance",
    description: "Client invoice with billing details and payment terms.",
    layout: "commercial",
    content: `# INVOICE

**Invoice No.:** {{invoice_no}}  
**Issue Date:** {{issue_date}}  
**Due Date:** {{due_date}}  
**Bill To:** {{client_name}}  
**Billing Address:** {{billing_address}}

## Invoice Details

{{line_items}}

**Subtotal:** {{subtotal}}  
**Tax / SST:** {{tax}}  
**Amount Due:** {{amount_due}}

## Payment Information

{{payment_information}}

{{notes}}`,
  },
  {
    id: "tpl-receipt",
    name: "Official Receipt",
    category: "Finance",
    description: "Official receipt generated after a payment is confirmed.",
    layout: "commercial",
    content: `# OFFICIAL RECEIPT

**Receipt No.:** {{receipt_no}}  
**Date:** {{date}}  
**Received From:** {{client_name}}  
**Amount:** {{amount}}  
**Payment Method:** {{payment_method}}  
**Reference:** {{payment_reference}}

## Payment For

{{payment_for}}

**Issued by:** {{issued_by}}`,
  },
  {
    id: "tpl-memo",
    name: "Internal Memo",
    category: "Internal",
    description: "Kretivco internal memo using the reusable letterhead design.",
    layout: "letterhead",
    content: `# INTERNAL MEMO

**Reference:** {{reference_no}}  
**Date:** {{date}}  
**To:** {{recipients}}  
**From:** {{sender}}  
**Subject:** {{subject}}

## Purpose

{{purpose}}

## Background

{{background}}

## Decision / Request

{{decision_request}}

## Required Actions

{{actions}}`,
  },
  {
    id: "tpl-letter",
    name: "Official Letter",
    category: "Letter",
    description: "Formal external letter using the Kretivco letterhead.",
    layout: "letterhead",
    content: `# {{subject}}

**Reference:** {{reference_no}}  
**Date:** {{date}}

{{recipient_name}}  
{{recipient_company}}  
{{recipient_address}}

Dear {{salutation}},

{{opening}}

{{body}}

{{closing}}

Yours sincerely,  
**{{sender_name}}**  
{{sender_title}}`,
  },
  {
    id: "tpl-mou",
    name: "Memorandum of Understanding",
    category: "Agreement",
    description: "Structured MoU starting point for partnership drafting.",
    layout: "report",
    content: `# MEMORANDUM OF UNDERSTANDING

This Memorandum of Understanding is made on **{{date}}** between:

**{{party_a}}**, {{party_a_details}}

and

**{{party_b}}**, {{party_b_details}}

## 1. Purpose

{{purpose}}

## 2. Scope and Responsibilities

{{responsibilities}}

## 3. Commercial Arrangement

{{commercial_terms}}

## 4. Reporting and Payment

{{reporting_payment}}

## 5. Term and Termination

{{term_termination}}

## 6. Confidentiality

{{confidentiality}}

## Signatures

{{signature_blocks}}`,
  },
  {
    id: "tpl-marketing-plan",
    name: "Marketing Plan",
    category: "Strategy",
    description: "Complete marketing-plan structure linked to funnel and content work.",
    layout: "report",
    content: `# MARKETING PLAN — {{client_name}}

## Executive Summary

{{executive_summary}}

## Market Diagnosis

{{market_diagnosis}}

## Audience and Personas

{{audience}}

## Positioning and Messaging

{{positioning}}

## Customer Journey and Funnel

{{funnel_strategy}}

## Channel Strategy

{{channel_strategy}}

## Content Pillars

{{content_pillars}}

## Budget and Timeline

{{budget_timeline}}

## KPI and Reporting

{{kpi_reporting}}`,
  },
  {
    id: "tpl-storyboard",
    name: "Video Storyboard",
    category: "Creative",
    description: "Storyboard and production brief for campaign videos.",
    layout: "report",
    content: `# VIDEO STORYBOARD — {{title}}

**Client:** {{client_name}}  
**Campaign:** {{campaign_name}}  
**Duration:** {{duration}}  
**Aspect Ratio:** {{aspect_ratio}}

## Creative Direction

{{creative_direction}}

## Scene Plan

{{scenes}}

## Voice-over / Dialogue

{{script}}

## Audio and Music

{{audio}}

## Props, Talent and Location

{{production_requirements}}

## AI Generation Prompts

{{ai_prompts}}`,
  },
];

function extractVariables(content: string) {
  return Array.from(new Set(Array.from(content.matchAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g)).map((match) => match[1])));
}

async function ensureStarterTemplates() {
  const sql = getDatabase();
  for (const item of STARTER_TEMPLATES) {
    await sql`
      insert into document_templates (
        id, organization_id, name, category, description, layout_key,
        content, variables, brand_settings, status
      ) values (
        ${item.id}, ${ORGANIZATION_ID}, ${item.name}, ${item.category}, ${item.description},
        ${item.layout}, ${item.content}, ${JSON.stringify(extractVariables(item.content))}::jsonb,
        '{}'::jsonb, 'Active'
      )
      on conflict (id) do nothing
    `;
  }
}

function mapTemplate(row: any) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? "",
    layout: row.layout_key,
    content: row.content,
    variables: Array.isArray(row.variables) ? row.variables : [],
    brandSettings: row.brand_settings ?? {},
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id ?? "",
    customerName: row.customer_name ?? "Kretivco",
    templateId: row.template_id ?? "",
    templateName: row.template_name ?? "Deleted template",
    title: row.title,
    documentType: row.document_type ?? "",
    reference: row.reference ?? "",
    status: row.status,
    values: row.field_values ?? {},
    brand: row.brand_settings ?? {},
    html: row.rendered_html ?? "",
    content: row.rendered_markdown ?? "",
    pdfUrl: row.pdf_url ?? "",
    wordUrl: row.word_url ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function audit(action: string, entityType: string, entityId: string | null, afterData?: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (
        ${ORGANIZATION_ID}, ${action}, ${entityType}, ${entityId},
        ${afterData ? JSON.stringify(afterData) : null}::jsonb,
        ${JSON.stringify({ source: "templates-api", authentication: "skipped" })}::jsonb
      )
    `;
  } catch {}
}

async function listData() {
  await ensureStarterTemplates();
  const sql = getDatabase();
  const [templateRows, documentRows] = await Promise.all([
    sql`select * from document_templates where organization_id = ${ORGANIZATION_ID} order by updated_at desc, name asc`,
    sql`
      select d.*, t.name as template_name, c.name as customer_name
      from generated_documents d
      left join document_templates t on t.id = d.template_id
      left join customers c on c.id = d.customer_id
      where d.organization_id = ${ORGANIZATION_ID}
      order by d.updated_at desc, d.title asc
    `,
  ]);
  return { templates: templateRows.map(mapTemplate), documents: documentRows.map(mapDocument), syncedAt: new Date().toISOString() };
}

export async function GET() {
  try {
    return NextResponse.json(await listData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load templates." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resource = clean(body.resource);
    const sql = getDatabase();

    if (resource === "template") {
      const name = clean(body.name);
      const content = clean(body.content);
      if (!name || !content) return NextResponse.json({ error: "Template name and content are required." }, { status: 400 });
      const id = clean(body.id) || randomUUID();
      const variables = array(body.variables).length ? array(body.variables) : extractVariables(content);
      const rows = await sql`
        insert into document_templates (
          id, organization_id, name, category, description, layout_key,
          content, variables, brand_settings, status
        ) values (
          ${id}, ${ORGANIZATION_ID}, ${name}, ${clean(body.category) || "General"},
          ${optional(body.description)}, ${clean(body.layout) || "plain"}, ${content},
          ${JSON.stringify(variables)}::jsonb, ${JSON.stringify(object(body.brandSettings))}::jsonb,
          ${clean(body.status) || "Active"}
        ) returning *
      `;
      const template = mapTemplate(rows[0]);
      await audit("create", "document_template", id, template);
      return NextResponse.json({ template }, { status: 201 });
    }

    if (resource === "document") {
      const title = clean(body.title);
      if (!title) return NextResponse.json({ error: "Document title is required." }, { status: 400 });
      const customerId = optional(body.customerId);
      if (customerId) {
        const customerRows = await sql`select id from customers where id = ${customerId} and organization_id = ${ORGANIZATION_ID}`;
        if (!customerRows.length) return NextResponse.json({ error: "Customer was not found." }, { status: 400 });
      }
      const id = clean(body.id) || randomUUID();
      const rows = await sql`
        insert into generated_documents (
          id, organization_id, customer_id, template_id, title, document_type,
          reference, status, field_values, brand_settings, rendered_html,
          rendered_markdown, pdf_url, word_url
        ) values (
          ${id}, ${ORGANIZATION_ID}, ${customerId}, ${optional(body.templateId)}, ${title},
          ${optional(body.documentType)}, ${optional(body.reference)}, ${clean(body.status) || "Draft"},
          ${JSON.stringify(object(body.values))}::jsonb, ${JSON.stringify(object(body.brand))}::jsonb,
          ${optional(body.html)}, ${optional(body.content)}, ${optional(body.pdfUrl)}, ${optional(body.wordUrl)}
        ) returning *
      `;
      const documentRows = await sql`
        select d.*, t.name as template_name, c.name as customer_name
        from generated_documents d
        left join document_templates t on t.id = d.template_id
        left join customers c on c.id = d.customer_id
        where d.id = ${id} and d.organization_id = ${ORGANIZATION_ID}
      `;
      const document = mapDocument(documentRows[0] ?? rows[0]);
      await audit("create", "generated_document", id, document);
      return NextResponse.json({ document }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create record." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const resource = clean(body.resource);
    const id = clean(body.id);
    if (!id) return NextResponse.json({ error: "Record ID is required." }, { status: 400 });
    const sql = getDatabase();

    if (resource === "template") {
      const name = clean(body.name);
      const content = clean(body.content);
      if (!name || !content) return NextResponse.json({ error: "Template name and content are required." }, { status: 400 });
      const variables = array(body.variables).length ? array(body.variables) : extractVariables(content);
      const rows = await sql`
        update document_templates set
          name = ${name}, category = ${clean(body.category) || "General"},
          description = ${optional(body.description)}, layout_key = ${clean(body.layout) || "plain"},
          content = ${content}, variables = ${JSON.stringify(variables)}::jsonb,
          brand_settings = ${JSON.stringify(object(body.brandSettings))}::jsonb,
          status = ${clean(body.status) || "Active"}
        where id = ${id} and organization_id = ${ORGANIZATION_ID}
        returning *
      `;
      if (!rows.length) return NextResponse.json({ error: "Template was not found." }, { status: 404 });
      const template = mapTemplate(rows[0]);
      await audit("update", "document_template", id, template);
      return NextResponse.json({ template });
    }

    if (resource === "document") {
      const rows = await sql`
        update generated_documents set
          title = ${clean(body.title)}, status = ${clean(body.status) || "Draft"},
          reference = ${optional(body.reference)}, field_values = ${JSON.stringify(object(body.values))}::jsonb,
          brand_settings = ${JSON.stringify(object(body.brand))}::jsonb,
          rendered_html = ${optional(body.html)}, rendered_markdown = ${optional(body.content)},
          pdf_url = ${optional(body.pdfUrl)}, word_url = ${optional(body.wordUrl)}
        where id = ${id} and organization_id = ${ORGANIZATION_ID}
        returning id
      `;
      if (!rows.length) return NextResponse.json({ error: "Document was not found." }, { status: 404 });
      const documentRows = await sql`
        select d.*, t.name as template_name, c.name as customer_name
        from generated_documents d
        left join document_templates t on t.id = d.template_id
        left join customers c on c.id = d.customer_id
        where d.id = ${id} and d.organization_id = ${ORGANIZATION_ID}
      `;
      const document = mapDocument(documentRows[0]);
      await audit("update", "generated_document", id, document);
      return NextResponse.json({ document });
    }

    return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update record." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = clean(url.searchParams.get("id"));
    const resource = clean(url.searchParams.get("resource"));
    if (!id) return NextResponse.json({ error: "Record ID is required." }, { status: 400 });
    const sql = getDatabase();

    if (resource === "template") {
      const rows = await sql`delete from document_templates where id = ${id} and organization_id = ${ORGANIZATION_ID} returning id`;
      if (!rows.length) return NextResponse.json({ error: "Template was not found." }, { status: 404 });
      await audit("delete", "document_template", id);
      return NextResponse.json({ ok: true, id });
    }

    if (resource === "document") {
      const rows = await sql`delete from generated_documents where id = ${id} and organization_id = ${ORGANIZATION_ID} returning id`;
      if (!rows.length) return NextResponse.json({ error: "Document was not found." }, { status: 404 });
      await audit("delete", "generated_document", id);
      return NextResponse.json({ ok: true, id });
    }

    return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete record." }, { status: 500 });
  }
}
