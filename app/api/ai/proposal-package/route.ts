import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { field, generateJson } from "@/lib/ai-generation";
import {
  LineItem, LineItemState, defaultSettings, lineItemValues, serialiseLineItems,
} from "@/lib/line-items";
import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const clean = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
const amount = (value: unknown) => Math.max(0, Number(value || 0) || 0);
const lines = (value: unknown) => Array.isArray(value)
  ? value.map((item) => clean(item, 1000)).filter(Boolean)
  : clean(value, 8000).split(/\n+/).map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
const markdownList = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- To be confirmed during review.";
const money = (value: number) => `RM${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const packageToken = (id: string) => `[AI package ${id}]`;

type PackageDraft = {
  packageId: string;
  source: "ai-nonymauz-cloud" | "starter";
  summary: string;
  proposal: {
    title: string;
    executiveSummary: string;
    observations: string;
    objectives: string[];
    strategy: string;
    scope: string[];
    timeline: string;
  };
  quotation: {
    title: string;
    scope: string;
    items: LineItem[];
    terms: string[];
    validityDays: number;
  };
  onboarding: { blueprint: string; notes: string; steps: string[] };
  projectBrief: {
    title: string;
    background: string;
    objective: string;
    deliverables: string[];
    timeline: string;
    responsibilities: string[];
    risks: string[];
    successMetrics: string[];
  };
};

function fallbackDraft(input: Record<string, any>): Omit<PackageDraft, "packageId" | "source"> {
  const client = input.customer.name;
  const project = input.projectTitle;
  const statedScope = input.scopeNotes || "Scope to be confirmed with the client during discovery.";
  return {
    summary: `Editable document package for ${project} and ${client}. Review all assumptions, pricing and dates before approval.`,
    proposal: {
      title: `${project} — Proposal`,
      executiveSummary: `${client} has engaged Kretivco to explore ${project}. This proposal converts the supplied brief and existing company records into an initial delivery direction for review.`,
      observations: input.contextSummary || `The current record contains an initial brief for ${project}. Any missing commercial or operational detail remains subject to confirmation.`,
      objectives: lines(input.objectives).length ? lines(input.objectives) : ["Confirm the intended business outcome", "Deliver the agreed scope to an approved timeline", "Define measurable success criteria"],
      strategy: "Begin with alignment and evidence gathering, move into production and review, then complete delivery with documented handover and reporting.",
      scope: lines(statedScope),
      timeline: input.targetLaunch ? `Work backwards from the target launch date of ${input.targetLaunch}; detailed milestones will be agreed during onboarding.` : "Timeline to be confirmed during onboarding after scope approval.",
    },
    quotation: {
      title: `${project} — Quotation`,
      scope: statedScope,
      items: [
        { id: randomUUID(), description: `${project} · Kretivco service fee`, quantity: 1, unit: "project", unitPrice: amount(input.budget) },
        ...(amount(input.mediaBudget) ? [{ id: randomUUID(), description: `${project} · media budget`, quantity: 1, unit: "allocation", unitPrice: amount(input.mediaBudget) }] : []),
      ],
      terms: ["All work begins after written approval.", "Any work outside the agreed scope requires a revised quotation.", "Payment schedule and tax treatment are subject to the approved commercial terms."],
      validityDays: Number(input.validityDays || 14),
    },
    onboarding: {
      blueprint: `${project} onboarding`,
      notes: `Draft onboarding generated from the approved client and opportunity context. Pricing, access and final deliverables require human verification.`,
      steps: ["Confirm client owner and decision maker", "Approve scope, quotation and timeline", "Collect brand assets and access", "Confirm deliverables and review process", "Create project workspace and kickoff meeting", "Approve production schedule"],
    },
    projectBrief: {
      title: project,
      background: `${client} requires an organised delivery plan for ${project}. This brief consolidates the current record into a starting point for the Kretivco team.`,
      objective: lines(input.objectives).join("; ") || "Deliver the agreed client outcome within the approved scope, budget and timeline.",
      deliverables: lines(statedScope),
      timeline: input.targetLaunch ? `Target launch: ${input.targetLaunch}` : "Target date to be confirmed.",
      responsibilities: ["Kretivco: planning, production, review coordination and delivery", `${client}: timely access, factual input, approvals and consolidated feedback`],
      risks: ["Delayed approvals or missing access", "Scope changes after commercial approval", "Unverified claims or assets"],
      successMetrics: ["Approved deliverables completed", "Milestones met against the agreed timeline", "Client acceptance recorded at handover"],
    },
  };
}

async function gatherPackageContext(customerId: string, opportunityId: string) {
  const sql = getDatabase();
  const [customerRows, contactRows, opportunityRows, brandRows, knowledgeRows, projectRows, documentRows] = await Promise.all([
    sql`select * from customers where id = ${customerId} and organization_id = ${ORGANIZATION_ID}`,
    sql`select * from contacts where customer_id = ${customerId} order by is_primary desc, updated_at desc limit 5`,
    opportunityId
      ? sql`select * from opportunities where id = ${opportunityId} and customer_id = ${customerId}`
      : sql`select * from opportunities where customer_id = ${customerId} order by updated_at desc limit 1`,
    sql`
      select b.id, b.name, b.description, p.positioning, p.audience, p.personality, p.voice,
        p.messaging, p.photography_direction, p.approved_claims, p.avoid_list
      from brands b
      left join lateral (
        select * from brand_dna_profiles p where p.brand_id = b.id
        order by (p.status = 'Approved') desc, p.updated_at desc limit 1
      ) p on true
      where b.customer_id = ${customerId}
    `,
    sql`select title, category, content from knowledge_entries where customer_id = ${customerId} order by updated_at desc limit 8`,
    sql`select name, status, progress, budget, due_date, notes from projects where customer_id = ${customerId} order by updated_at desc limit 5`,
    sql`select type, title, status, value, due_date, notes from sales_documents where customer_id = ${customerId} order by updated_at desc limit 5`,
  ]);
  if (!customerRows.length) throw new Error("Customer was not found.");
  return {
    customer: customerRows[0], contacts: contactRows, opportunity: opportunityRows[0] || null,
    brands: brandRows, knowledge: knowledgeRows, existingProjects: projectRows, existingDocuments: documentRows,
  };
}

function validateGenerated(parsed: Record<string, any>, fallback: ReturnType<typeof fallbackDraft>) {
  const proposal = parsed.proposal || {};
  const quotation = parsed.quotation || {};
  const onboarding = parsed.onboarding || {};
  const projectBrief = parsed.projectBrief || {};
  return {
    summary: clean(parsed.summary, 2000) || fallback.summary,
    proposal: {
      title: clean(proposal.title, 200) || fallback.proposal.title,
      executiveSummary: clean(proposal.executiveSummary, 5000) || fallback.proposal.executiveSummary,
      observations: clean(proposal.observations, 5000) || fallback.proposal.observations,
      objectives: lines(proposal.objectives).length ? lines(proposal.objectives) : fallback.proposal.objectives,
      strategy: clean(proposal.strategy, 6000) || fallback.proposal.strategy,
      scope: lines(proposal.scope).length ? lines(proposal.scope) : fallback.proposal.scope,
      timeline: clean(proposal.timeline, 4000) || fallback.proposal.timeline,
    },
    quotation: {
      title: clean(quotation.title, 200) || fallback.quotation.title,
      scope: clean(quotation.scope, 6000) || fallback.quotation.scope,
      // Commercial values are never accepted from the model; only descriptions are used.
      items: fallback.quotation.items.map((item, index) => ({
        ...item,
        description: clean(quotation.items?.[index]?.description, 500) || item.description,
      })),
      terms: lines(quotation.terms).length ? lines(quotation.terms) : fallback.quotation.terms,
      validityDays: fallback.quotation.validityDays,
    },
    onboarding: {
      blueprint: clean(onboarding.blueprint, 240) || fallback.onboarding.blueprint,
      notes: clean(onboarding.notes, 5000) || fallback.onboarding.notes,
      steps: lines(onboarding.steps).length ? lines(onboarding.steps).slice(0, 20) : fallback.onboarding.steps,
    },
    projectBrief: {
      title: clean(projectBrief.title, 200) || fallback.projectBrief.title,
      background: clean(projectBrief.background, 5000) || fallback.projectBrief.background,
      objective: clean(projectBrief.objective, 5000) || fallback.projectBrief.objective,
      deliverables: lines(projectBrief.deliverables).length ? lines(projectBrief.deliverables) : fallback.projectBrief.deliverables,
      timeline: clean(projectBrief.timeline, 4000) || fallback.projectBrief.timeline,
      responsibilities: lines(projectBrief.responsibilities).length ? lines(projectBrief.responsibilities) : fallback.projectBrief.responsibilities,
      risks: lines(projectBrief.risks).length ? lines(projectBrief.risks) : fallback.projectBrief.risks,
      successMetrics: lines(projectBrief.successMetrics).length ? lines(projectBrief.successMetrics) : fallback.projectBrief.successMetrics,
    },
  };
}

function replaceVariables(content: string, values: Record<string, string>) {
  return content.replace(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (_, key) => values[key] || `{{${key}}}`);
}

async function audit(entityId: string, afterData: unknown) {
  try {
    const sql = getDatabase();
    await sql`
      insert into audit_logs (organization_id, action, entity_type, entity_id, after_data, metadata)
      values (${ORGANIZATION_ID}, 'create-ai-document-package', 'ai_document_package', ${entityId},
        ${JSON.stringify(afterData)}::jsonb, ${JSON.stringify({ source: "proposal-package-api", authentication: "skipped", human_review_required: true })}::jsonb)
    `;
  } catch {}
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json();
    const action = clean(body.action, 40);
    const customerId = clean(body.customerId, 100);
    if (!customerId) return NextResponse.json({ error: "Select a customer first." }, { status: 400 });

    if (action === "generate") {
      const context = await gatherPackageContext(customerId, clean(body.opportunityId, 100));
      const budget = amount(body.budget || context.opportunity?.value);
      const input = {
        customer: {
          name: context.customer.name, legalName: context.customer.legal_name, industry: context.customer.industry,
          contact: context.customer.primary_contact_name, notes: context.customer.notes,
        },
        opportunity: context.opportunity,
        contacts: context.contacts,
        brands: context.brands,
        knowledge: context.knowledge.map((item: any) => ({ title: item.title, category: item.category, excerpt: clean(item.content, 2200) })),
        existingProjects: context.existingProjects,
        existingDocuments: context.existingDocuments,
        projectTitle: field(body.projectTitle, context.opportunity?.title || "New client engagement", 200),
        objectives: field(body.objectives, "Confirm the intended outcome with the client", 3000),
        scopeNotes: field(body.scopeNotes, context.opportunity?.notes || "Scope to be confirmed", 5000),
        budget,
        mediaBudget: amount(body.mediaBudget),
        targetLaunch: clean(body.targetLaunch, 20),
        validityDays: Math.min(90, Math.max(1, Number(body.validityDays || 14))),
        contextSummary: `Current opportunity: ${context.opportunity?.title || "none selected"}; stage: ${context.opportunity?.stage || "not recorded"}; stated value: ${money(budget)}.`,
      };
      const fallback = fallbackDraft(input);
      const outcome = await generateJson({
        mode: "deep",
        useRag: true,
        useTools: false,
        temperature: 0.25,
        input,
        fallback: () => fallback,
        validate: (parsed) => validateGenerated(parsed, fallback),
        system: [
          "You are the senior client services and commercial lead for Kretivco Mediaworks, a Malaysian creative and technology agency.",
          "Create one coherent proposal package from the supplied CRM, Brand DNA and knowledge records.",
          "Return JSON only without markdown fences.",
          "Do not invent pricing, dates, legal terms, approved claims, client decisions or capabilities. Mark missing facts as requiring confirmation.",
          "Commercial values are controlled by the application; write useful item descriptions but do not calculate or change prices.",
          "Write practical, client-specific content rather than generic agency language.",
          "Schema: {summary:string,proposal:{title:string,executiveSummary:string,observations:string,objectives:string[],strategy:string,scope:string[],timeline:string},quotation:{title:string,scope:string,items:[{description:string}],terms:string[]},onboarding:{blueprint:string,notes:string,steps:string[]},projectBrief:{title:string,background:string,objective:string,deliverables:string[],timeline:string,responsibilities:string[],risks:string[],successMetrics:string[]}}",
        ],
      });
      const draft: PackageDraft = { packageId: randomUUID(), source: outcome.source, ...outcome.value };

      try {
        const sql = getDatabase();
        await sql`
          insert into ai_usage_events (organization_id, capability, model, mode, latency_ms, success, metadata)
          values (${ORGANIZATION_ID}, 'proposal-package', 'auto', 'deep', ${Date.now() - started}, true,
            ${JSON.stringify({ customerId, opportunityId: body.opportunityId || null, source: outcome.source })}::jsonb)
        `;
      } catch {}
      return NextResponse.json({ draft });
    }

    if (action === "save") {
      const draft = body.draft as PackageDraft;
      const packageId = clean(draft?.packageId, 100);
      if (!packageId || !draft?.proposal || !draft?.quotation || !draft?.onboarding || !draft?.projectBrief) {
        return NextResponse.json({ error: "Generate and review the document package before saving." }, { status: 400 });
      }
      const sql = getDatabase();
      const customerRows = await sql`select name from customers where id = ${customerId} and organization_id = ${ORGANIZATION_ID}`;
      if (!customerRows.length) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });
      const customerName = customerRows[0].name;
      const token = packageToken(packageId);
      const today = new Date().toISOString().slice(0, 10);
      const targetLaunch = clean(body.targetLaunch, 20) || null;
      const budget = amount(body.budget);
      const mediaBudget = amount(body.mediaBudget);
      const total = budget + mediaBudget;
      const validityDays = Math.min(90, Math.max(1, Number(draft.quotation.validityDays || 14)));
      const validUntil = new Date(Date.now() + validityDays * 86_400_000).toISOString().slice(0, 10);
      const referenceBase = `AI-${today.replaceAll("-", "")}-${packageId.slice(0, 6).toUpperCase()}`;

      const templateRows = await sql`select id, content from document_templates where id in ('tpl-proposal', 'tpl-quotation', 'tpl-project-brief')`;
      const templates = new Map(templateRows.map((row: any) => [row.id, row]));
      const ids: Record<string, string> = {};

      const proposalValues: Record<string, string> = {
        package_id: packageId, reference_no: `${referenceBase}-P`, date: today, client_name: customerName,
        subject: clean(draft.proposal.title, 200), campaign_period: targetLaunch ? `Target launch ${targetLaunch}` : "To be confirmed",
        executive_summary: clean(draft.proposal.executiveSummary, 8000), observations: clean(draft.proposal.observations, 8000),
        objectives: markdownList(lines(draft.proposal.objectives)), strategy: clean(draft.proposal.strategy, 10000),
        scope: markdownList(lines(draft.proposal.scope)), management_fee: budget ? money(budget) : "To be confirmed",
        media_budget: mediaBudget ? money(mediaBudget) : "Not included / to be confirmed", total_investment: total ? money(total) : "To be confirmed",
        timeline: clean(draft.proposal.timeline, 8000),
      };
      let existing = await sql`select id from generated_documents where organization_id = ${ORGANIZATION_ID} and field_values->>'package_id' = ${packageId} and document_type = 'Proposal' limit 1`;
      if (existing.length) ids.proposalDocumentId = existing[0].id;
      else {
        ids.proposalDocumentId = randomUUID();
        const template = templates.get("tpl-proposal");
        await sql`
          insert into generated_documents (id, organization_id, customer_id, template_id, title, document_type, reference, status, field_values, brand_settings, rendered_markdown)
          values (${ids.proposalDocumentId}, ${ORGANIZATION_ID}, ${customerId}, ${template?.id || null}, ${clean(draft.proposal.title, 200)}, 'Proposal', ${proposalValues.reference_no}, 'Draft',
            ${JSON.stringify(proposalValues)}::jsonb, '{}'::jsonb, ${template ? replaceVariables(template.content, proposalValues) : clean(draft.proposal.executiveSummary, 20000)})
        `;
      }

      const safeItems: LineItem[] = (Array.isArray(draft.quotation.items) ? draft.quotation.items : []).slice(0, 20).map((item, index) => ({
        id: clean(item.id, 100) || randomUUID(), description: clean(item.description, 500) || `Service item ${index + 1}`,
        quantity: Math.max(0, Number(item.quantity || 0)), unit: clean(item.unit, 50), unitPrice: amount(item.unitPrice),
      }));
      if (!safeItems.length) safeItems.push({ id: randomUUID(), description: clean(draft.quotation.title, 500), quantity: 1, unit: "project", unitPrice: budget });
      const lineState: LineItemState = { items: safeItems, settings: { ...defaultSettings } };
      const quotationFlatValues = lineItemValues(lineState);
      const quotationValues: Record<string, string> = {
        package_id: packageId, quotation_no: `${referenceBase}-Q`, date: today, client_name: customerName,
        project_name: clean(draft.quotation.title, 200), scope: clean(draft.quotation.scope, 10000),
        terms: markdownList(lines(draft.quotation.terms)), valid_until: validUntil,
        ...quotationFlatValues, _line_items: serialiseLineItems(lineState),
      };
      existing = await sql`select id from generated_documents where organization_id = ${ORGANIZATION_ID} and field_values->>'package_id' = ${packageId} and document_type = 'Quotation' limit 1`;
      if (existing.length) ids.quotationDocumentId = existing[0].id;
      else {
        ids.quotationDocumentId = randomUUID();
        const template = templates.get("tpl-quotation");
        await sql`
          insert into generated_documents (id, organization_id, customer_id, template_id, title, document_type, reference, status, field_values, brand_settings, rendered_markdown)
          values (${ids.quotationDocumentId}, ${ORGANIZATION_ID}, ${customerId}, ${template?.id || null}, ${clean(draft.quotation.title, 200)}, 'Quotation', ${quotationValues.quotation_no}, 'Draft',
            ${JSON.stringify(quotationValues)}::jsonb, '{}'::jsonb, ${template ? replaceVariables(template.content, quotationValues) : clean(draft.quotation.scope, 20000)})
        `;
      }

      const briefValues: Record<string, string> = {
        package_id: packageId, date: today, client_name: customerName, project_name: clean(draft.projectBrief.title, 200),
        background: clean(draft.projectBrief.background, 8000), objective: clean(draft.projectBrief.objective, 8000),
        deliverables: markdownList(lines(draft.projectBrief.deliverables)), timeline: clean(draft.projectBrief.timeline, 8000),
        responsibilities: markdownList(lines(draft.projectBrief.responsibilities)), risks: markdownList(lines(draft.projectBrief.risks)),
        success_metrics: markdownList(lines(draft.projectBrief.successMetrics)),
      };
      existing = await sql`select id from generated_documents where organization_id = ${ORGANIZATION_ID} and field_values->>'package_id' = ${packageId} and document_type = 'Project Brief' limit 1`;
      if (existing.length) ids.projectBriefDocumentId = existing[0].id;
      else {
        ids.projectBriefDocumentId = randomUUID();
        const template = templates.get("tpl-project-brief");
        await sql`
          insert into generated_documents (id, organization_id, customer_id, template_id, title, document_type, reference, status, field_values, brand_settings, rendered_markdown)
          values (${ids.projectBriefDocumentId}, ${ORGANIZATION_ID}, ${customerId}, ${template?.id || null}, ${clean(draft.projectBrief.title, 200)}, 'Project Brief', ${`${referenceBase}-B`}, 'Draft',
            ${JSON.stringify(briefValues)}::jsonb, '{}'::jsonb, ${template ? replaceVariables(template.content, briefValues) : clean(draft.projectBrief.background, 20000)})
        `;
      }

      existing = await sql`select id from sales_documents where generated_document_id = ${ids.proposalDocumentId} limit 1`;
      if (existing.length) ids.proposalSalesId = existing[0].id;
      else {
        ids.proposalSalesId = randomUUID();
        await sql`insert into sales_documents (id, customer_id, type, title, reference, status, value, issue_date, due_date, notes, generated_document_id)
          values (${ids.proposalSalesId}, ${customerId}, 'Proposal', ${clean(draft.proposal.title, 200)}, ${proposalValues.reference_no}, 'Draft', ${total}, ${today}, ${targetLaunch}, ${`${token} Human review required before sending.`}, ${ids.proposalDocumentId})`;
      }
      existing = await sql`select id from sales_documents where generated_document_id = ${ids.quotationDocumentId} limit 1`;
      if (existing.length) ids.quotationSalesId = existing[0].id;
      else {
        ids.quotationSalesId = randomUUID();
        await sql`insert into sales_documents (id, customer_id, type, title, reference, status, value, issue_date, due_date, notes, generated_document_id)
          values (${ids.quotationSalesId}, ${customerId}, 'Quotation', ${clean(draft.quotation.title, 200)}, ${quotationValues.quotation_no}, 'Draft', ${quotationFlatValues.total.replace(/[^0-9.]/g, "") || 0}, ${today}, ${validUntil}, ${`${token} Human review required before sending.`}, ${ids.quotationDocumentId})`;
      }

      const notePattern = `%${token}%`;
      existing = await sql`select id from onboardings where customer_id = ${customerId} and notes like ${notePattern} limit 1`;
      if (existing.length) ids.onboardingId = existing[0].id;
      else {
        ids.onboardingId = randomUUID();
        await sql`insert into onboardings (id, customer_id, blueprint, status, target_launch, notes)
          values (${ids.onboardingId}, ${customerId}, ${clean(draft.onboarding.blueprint, 240)}, 'Not started', ${targetLaunch}, ${`${token} ${clean(draft.onboarding.notes, 6000)}`})`;
        const steps = lines(draft.onboarding.steps).slice(0, 20);
        for (let index = 0; index < steps.length; index += 1) {
          await sql`insert into onboarding_steps (id, onboarding_id, label, is_done, sort_order) values (${randomUUID()}, ${ids.onboardingId}, ${steps[index]}, false, ${index})`;
        }
      }

      existing = await sql`select id from projects where customer_id = ${customerId} and notes like ${notePattern} limit 1`;
      if (existing.length) ids.projectId = existing[0].id;
      else {
        ids.projectId = randomUUID();
        await sql`insert into projects (id, customer_id, name, status, progress, budget, due_date, owner, notes)
          values (${ids.projectId}, ${customerId}, ${clean(draft.projectBrief.title, 200)}, 'Planning', 0, ${total}, ${targetLaunch}, 'Kretivco Team',
            ${`${token}\n\nObjective: ${clean(draft.projectBrief.objective, 4000)}\n\nDeliverables:\n${markdownList(lines(draft.projectBrief.deliverables))}`})`;
      }

      await audit(packageId, { customerId, ids, status: "Draft", source: draft.source });
      return NextResponse.json({ saved: true, packageId, ids, message: "Proposal package saved as draft records for human review." });
    }

    return NextResponse.json({ error: "Unsupported proposal-package action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process the proposal package." }, { status: 502 });
  }
}
