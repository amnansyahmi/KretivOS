"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  ACTION_CATALOG,
  AUTOMATION_APPROVAL_KEY,
  AUTOMATION_APPROVAL_REQUEST,
  AUTOMATION_DATA_UPDATED,
  AUTOMATION_PROCESSED_KEY,
  AUTOMATION_RECIPE_KEY,
  AUTOMATION_RUN_KEY,
  AUTOMATION_RUN_REQUEST,
  AutomationAction,
  AutomationApproval,
  AutomationEvent,
  AutomationRecipe,
  AutomationRun,
  AutomationTrigger,
  DEFAULT_AUTOMATION_RECIPES,
  KretivNotification,
  NOTIFICATION_KEY,
  automationId
} from "@/lib/automation-engine";
import { BUSINESS_STORAGE_KEY, CUSTOMER_STORAGE_KEY, starterBusinessData } from "@/lib/business-data";
import { KNOWLEDGE_STORAGE_KEY, builtInKnowledge, slugifyFilename } from "@/lib/knowledge";

const FUNNEL_KEY = "kretivos-funnels";
const GENERATED_DOCUMENT_KEY = "kretivos-generated-documents";

type BusinessData = typeof starterBusinessData;

type Snapshot = {
  business: BusinessData;
  funnels: any[];
  knowledge: any[];
  documents: any[];
};

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

function readBusiness(): BusinessData {
  const loaded = parse<BusinessData>(localStorage.getItem(BUSINESS_STORAGE_KEY), clone(starterBusinessData));
  return loaded?.customers ? loaded : clone(starterBusinessData);
}

function writeBusiness(data: BusinessData) {
  localStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(data.customers));
}

function readKnowledge() {
  return parse<any[]>(localStorage.getItem(KNOWLEDGE_STORAGE_KEY), clone(builtInKnowledge));
}

function writeKnowledge(entries: any[]) {
  localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(entries));
}

function readRecipes(): AutomationRecipe[] {
  const saved = parse<AutomationRecipe[]>(localStorage.getItem(AUTOMATION_RECIPE_KEY), []);
  if (!saved.length) {
    localStorage.setItem(AUTOMATION_RECIPE_KEY, JSON.stringify(DEFAULT_AUTOMATION_RECIPES));
    return clone(DEFAULT_AUTOMATION_RECIPES);
  }

  const savedById = new Map(saved.map((recipe) => [recipe.id, recipe]));
  const mergedDefaults = DEFAULT_AUTOMATION_RECIPES.map((recipe) => ({ ...recipe, ...(savedById.get(recipe.id) || {}) }));
  const custom = saved.filter((recipe) => !DEFAULT_AUTOMATION_RECIPES.some((item) => item.id === recipe.id));
  return [...mergedDefaults, ...custom];
}

function writeRecipes(recipes: AutomationRecipe[]) {
  localStorage.setItem(AUTOMATION_RECIPE_KEY, JSON.stringify(recipes));
}

function appendRun(run: AutomationRun) {
  const current = parse<AutomationRun[]>(localStorage.getItem(AUTOMATION_RUN_KEY), []);
  localStorage.setItem(AUTOMATION_RUN_KEY, JSON.stringify([run, ...current].slice(0, 500)));
}

function updateRun(runId: string, patch: Partial<AutomationRun>) {
  const current = parse<AutomationRun[]>(localStorage.getItem(AUTOMATION_RUN_KEY), []);
  localStorage.setItem(AUTOMATION_RUN_KEY, JSON.stringify(current.map((run) => run.id === runId ? { ...run, ...patch } : run)));
}

function updateRecipeRun(recipeId: string) {
  const recipes = readRecipes();
  const stamp = now();
  writeRecipes(recipes.map((recipe) => recipe.id === recipeId
    ? { ...recipe, runCount: Number(recipe.runCount || 0) + 1, lastRun: stamp, updatedAt: stamp }
    : recipe));
}

function appendApproval(approval: AutomationApproval) {
  const current = parse<AutomationApproval[]>(localStorage.getItem(AUTOMATION_APPROVAL_KEY), []);
  if (current.some((item) => item.recipeId === approval.recipeId && item.event.id === approval.event.id)) return;
  localStorage.setItem(AUTOMATION_APPROVAL_KEY, JSON.stringify([approval, ...current].slice(0, 300)));
}

function markApproval(id: string, status: "Approved" | "Rejected") {
  const current = parse<AutomationApproval[]>(localStorage.getItem(AUTOMATION_APPROVAL_KEY), []);
  localStorage.setItem(AUTOMATION_APPROVAL_KEY, JSON.stringify(current.map((item) => item.id === id ? { ...item, status, resolvedAt: now() } : item)));
}

function isProcessed(key: string) {
  return parse<string[]>(localStorage.getItem(AUTOMATION_PROCESSED_KEY), []).includes(key);
}

function markProcessed(key: string) {
  const current = parse<string[]>(localStorage.getItem(AUTOMATION_PROCESSED_KEY), []);
  localStorage.setItem(AUTOMATION_PROCESSED_KEY, JSON.stringify([key, ...current.filter((item) => item !== key)].slice(0, 1500)));
}

function notificationExists(notifications: KretivNotification[], id: string) {
  return notifications.some((notification) => notification.id === id);
}

function createKnowledgeEntry(input: { id: string; title: string; client: string; category: string; tags: string[]; content: string }) {
  const entries = readKnowledge();
  if (entries.some((entry) => entry.id === input.id)) return false;
  const stamp = now();
  entries.unshift({
    ...input,
    filename: slugifyFilename(input.title),
    source: "editor",
    createdAt: stamp,
    updatedAt: stamp
  });
  writeKnowledge(entries);
  return true;
}

function customerName(business: BusinessData, customerId: string) {
  return business.customers.find((customer) => customer.id === customerId)?.name || "Unknown customer";
}

function funnelMarkdown(funnel: any) {
  const stages = Array.isArray(funnel.stages) ? funnel.stages : [];
  return [
    `# ${funnel.name || "Marketing Funnel"}`,
    "",
    `**Client:** ${funnel.client || "General"}`,
    `**Status:** ${funnel.status || "Draft"}`,
    `**Objective:** ${funnel.objective || ""}`,
    `**Audience:** ${funnel.audience || ""}`,
    `**Offer:** ${funnel.offer || ""}`,
    `**Channels:** ${funnel.channels || ""}`,
    "",
    funnel.summary || "",
    "",
    ...stages.flatMap((stage: any) => [
      `## ${stage.key || "Stage"} — ${stage.title || ""}`,
      "",
      `**Objective:** ${stage.objective || ""}`,
      `**KPI:** ${stage.kpi || ""}`,
      "",
      ...(Array.isArray(stage.items) ? stage.items.map((item: any) => `- **${item.title || "Activity"}** — ${item.channel || ""}; ${item.format || ""}; CTA: ${item.cta || ""}`) : []),
      ""
    ])
  ].join("\n");
}

function actionCompatible(action: AutomationAction, trigger: AutomationTrigger) {
  return ACTION_CATALOG.find((item) => item.id === action)?.compatible.includes(trigger) ?? false;
}

function executeAction(action: AutomationAction, event: AutomationEvent, updatedKeys: Set<string>) {
  if (!actionCompatible(action, event.trigger)) return `Skipped incompatible action ${action}.`;

  if (action === "create_onboarding") {
    const business = readBusiness();
    const customer = event.payload;
    if (business.onboardings.some((item) => item.customerId === customer.id)) return "Onboarding already exists.";
    const stamp = now();
    business.onboardings.unshift({
      id: automationId("onboarding"),
      customerId: customer.id,
      blueprint: "Standard Client Onboarding",
      status: "Not started",
      targetLaunch: addDays(today(), 30),
      notes: "Automatically created by Customer foundation automation.",
      steps: [
        { id: automationId("step"), label: "Customer profile and primary contacts", done: false },
        { id: automationId("step"), label: "Commercial agreement and payment terms", done: false },
        { id: automationId("step"), label: "Brand DNA and approved assets", done: false },
        { id: automationId("step"), label: "Delivery workspace and project plan", done: false },
        { id: automationId("step"), label: "Kickoff and launch checklist", done: false }
      ],
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Onboarding checklist created.";
  }

  if (action === "create_onboarding_project") {
    const business = readBusiness();
    const customer = event.payload;
    if (business.projects.some((item) => item.customerId === customer.id && item.name.toLowerCase().includes("onboarding"))) return "Onboarding project already exists.";
    const stamp = now();
    business.projects.unshift({
      id: automationId("project"),
      customerId: customer.id,
      name: `${customer.name} Client Onboarding`,
      status: "Planning",
      progress: 0,
      budget: 0,
      dueDate: addDays(today(), 30),
      owner: "Kretivco Team",
      notes: "Automatically created from the customer master record.",
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Onboarding project created.";
  }

  if (action === "create_customer_knowledge") {
    const customer = event.payload;
    const created = createKnowledgeEntry({
      id: `auto-customer-profile-${customer.id}`,
      title: `${customer.name} — Customer Profile`,
      client: customer.name,
      category: "Customer",
      tags: ["customer", "profile", customer.industry || "industry pending"],
      content: `# ${customer.name}\n\n## Customer Details\n\n- **Legal name:** ${customer.legalName || "To be confirmed"}\n- **Industry:** ${customer.industry || "To be confirmed"}\n- **Status:** ${customer.status || "Lead"}\n- **Primary contact:** ${customer.contactName || "To be confirmed"}\n- **Email:** ${customer.email || "To be confirmed"}\n- **Phone:** ${customer.phone || "To be confirmed"}\n\n## Notes\n\n${customer.notes || "Add the customer brief, objectives, services, commercial terms and working preferences here."}`
    });
    if (created) updatedKeys.add(KNOWLEDGE_STORAGE_KEY);
    return created ? "Customer profile knowledge created." : "Customer profile knowledge already exists.";
  }

  if (action === "create_delivery_project") {
    const business = readBusiness();
    const opportunity = event.payload;
    if (business.projects.some((item) => item.customerId === opportunity.customerId && item.name === opportunity.title)) return "Delivery project already exists.";
    const stamp = now();
    business.projects.unshift({
      id: automationId("project"),
      customerId: opportunity.customerId,
      name: opportunity.title,
      status: "Planning",
      progress: 0,
      budget: Number(opportunity.value || 0),
      dueDate: opportunity.dueDate || addDays(today(), 30),
      owner: "Kretivco Team",
      notes: `Created from won CRM opportunity ${opportunity.title}.`,
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Delivery project created.";
  }

  if (action === "create_sales_order_draft") {
    const business = readBusiness();
    const opportunity = event.payload;
    const reference = `SO-${String(opportunity.id).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`;
    if (business.documents.some((item) => item.reference === reference)) return "Sales order already exists.";
    const stamp = now();
    business.documents.unshift({
      id: automationId("doc"),
      customerId: opportunity.customerId,
      type: "Sales Order",
      title: opportunity.title,
      reference,
      status: "Draft",
      value: Number(opportunity.value || 0),
      issueDate: today(),
      dueDate: opportunity.dueDate || addDays(today(), 14),
      notes: "Draft generated from a won CRM opportunity. Review before sending.",
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Draft sales order created.";
  }

  if (action === "ensure_income_transaction") {
    const business = readBusiness();
    const record = event.payload;
    const settlement = event.trigger === "settlement.paid";
    const reference = settlement ? `SET-${record.periodEnd}` : record.reference;
    if (business.transactions.some((item) => item.reference === reference && item.type === "Income")) return "Income transaction already exists.";
    const stamp = now();
    const amount = settlement
      ? Number(record.units || 0) * Number(record.feePerUnit || 0) + Number(record.adReimbursement || 0)
      : Number(record.value || 0);
    business.transactions.unshift({
      id: automationId("txn"),
      customerId: record.customerId,
      type: "Income",
      category: settlement ? "Settlement" : "Invoice",
      amount,
      date: today(),
      status: "Cleared",
      reference,
      notes: settlement ? "Automatically recorded from paid settlement." : "Automatically recorded from paid invoice.",
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Income transaction recorded.";
  }

  if (action === "create_invoice_receipt") {
    const business = readBusiness();
    const invoice = event.payload;
    const reference = `RCPT-${invoice.reference || String(invoice.id).slice(-8)}`;
    if (business.documents.some((item) => item.reference === reference)) return "Invoice receipt already exists.";
    const stamp = now();
    business.documents.unshift({
      id: automationId("doc"),
      customerId: invoice.customerId,
      type: "Receipt",
      title: `Receipt — ${invoice.title}`,
      reference,
      status: "Paid",
      value: Number(invoice.value || 0),
      issueDate: today(),
      dueDate: today(),
      notes: `Automatically generated from paid invoice ${invoice.reference || invoice.id}.`,
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Invoice receipt created.";
  }

  if (action === "create_settlement_receipt") {
    const business = readBusiness();
    const settlement = event.payload;
    const reference = `RCPT-SET-${settlement.periodEnd}`;
    if (business.documents.some((item) => item.reference === reference)) return "Settlement receipt already exists.";
    const stamp = now();
    const total = Number(settlement.units || 0) * Number(settlement.feePerUnit || 0) + Number(settlement.adReimbursement || 0);
    business.documents.unshift({
      id: automationId("doc"),
      customerId: settlement.customerId,
      type: "Receipt",
      title: `Settlement Receipt · ${settlement.periodStart} to ${settlement.periodEnd}`,
      reference,
      status: "Paid",
      value: total,
      issueDate: today(),
      dueDate: today(),
      notes: "Automatically generated from a paid client settlement.",
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Settlement receipt created.";
  }

  if (action === "activate_customer") {
    const business = readBusiness();
    const onboarding = event.payload;
    business.customers = business.customers.map((customer) => customer.id === onboarding.customerId ? { ...customer, status: "Active", updatedAt: now() } : customer) as any;
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Customer activated.";
  }

  if (action === "activate_customer_projects") {
    const business = readBusiness();
    const onboarding = event.payload;
    business.projects = business.projects.map((project) => project.customerId === onboarding.customerId && project.status === "Planning"
      ? { ...project, status: "Active", updatedAt: now() }
      : project) as any;
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Planning projects activated.";
  }

  if (action === "create_funnel_knowledge") {
    const funnel = event.payload;
    const created = createKnowledgeEntry({
      id: `auto-funnel-${funnel.id}`,
      title: `${funnel.name} — Funnel`,
      client: funnel.client || "General",
      category: "Marketing Funnel",
      tags: ["funnel", "TOFU", "MOFU", "BOFU", "retention"],
      content: funnelMarkdown(funnel)
    });
    if (created) updatedKeys.add(KNOWLEDGE_STORAGE_KEY);
    return created ? "Funnel archived as Markdown knowledge." : "Funnel knowledge already exists.";
  }

  if (action === "create_campaign_project") {
    const business = readBusiness();
    const funnel = event.payload;
    const customer = business.customers.find((item) => item.name.toLowerCase() === String(funnel.client || "").toLowerCase());
    if (!customer) return "No matching customer found for funnel.";
    const name = `Campaign · ${funnel.name}`;
    if (business.projects.some((item) => item.customerId === customer.id && item.name === name)) return "Campaign project already exists.";
    const stamp = now();
    business.projects.unshift({
      id: automationId("project"),
      customerId: customer.id,
      name,
      status: "Active",
      progress: 0,
      budget: 0,
      dueDate: addDays(today(), 30),
      owner: "Kretivco Team",
      notes: `Automatically created from active funnel ${funnel.name}.`,
      createdAt: stamp,
      updatedAt: stamp
    } as any);
    writeBusiness(business);
    updatedKeys.add(BUSINESS_STORAGE_KEY);
    return "Campaign project created.";
  }

  if (action === "archive_project_summary") {
    const business = readBusiness();
    const project = event.payload;
    const client = customerName(business, project.customerId);
    const created = createKnowledgeEntry({
      id: `auto-project-summary-${project.id}`,
      title: `${project.name} — Completion Summary`,
      client,
      category: "Project",
      tags: ["project", "completed", "delivery"],
      content: `# ${project.name}\n\n**Client:** ${client}\n**Status:** ${project.status}\n**Owner:** ${project.owner || "Kretivco Team"}\n**Budget:** RM${Number(project.budget || 0).toLocaleString("en-MY")}\n**Due date:** ${project.dueDate || "Not set"}\n\n## Completion Notes\n\n${project.notes || "Add delivered scope, outcomes, links, lessons learned and follow-up actions."}`
    });
    if (created) updatedKeys.add(KNOWLEDGE_STORAGE_KEY);
    return created ? "Project completion summary archived." : "Project summary already exists.";
  }

  if (action === "archive_generated_document") {
    const document = event.payload;
    const created = createKnowledgeEntry({
      id: `auto-generated-document-${document.id}`,
      title: document.title || document.templateName || "Generated Document",
      client: "Kretivco",
      category: "Generated Document",
      tags: ["document", String(document.templateName || "template").toLowerCase()],
      content: document.content || ""
    });
    if (created) updatedKeys.add(KNOWLEDGE_STORAGE_KEY);
    return created ? "Generated document archived in Knowledge." : "Generated document already archived.";
  }

  if (action === "create_due_notifications") {
    const business = readBusiness();
    const notifications = parse<KretivNotification[]>(localStorage.getItem(NOTIFICATION_KEY), []);
    const date = today();
    const upcoming = addDays(date, 7);
    const additions: KretivNotification[] = [];

    for (const invoice of business.documents.filter((item) => item.type === "Invoice" && !["Paid", "Cancelled"].includes(item.status))) {
      if (!invoice.dueDate || invoice.dueDate > date) continue;
      const id = `due-invoice-${invoice.id}-${date}`;
      if (notificationExists(notifications, id)) continue;
      additions.push({ id, type: "Warning", title: `Invoice requires attention · ${customerName(business, invoice.customerId)}`, description: `${invoice.title} (${invoice.reference || "no reference"}) was due ${invoice.dueDate}.`, href: "/sales?tab=invoice", entityId: invoice.id, dueDate: invoice.dueDate, read: false, createdAt: now() });
    }

    for (const settlement of business.settlements.filter((item) => item.status !== "Paid")) {
      if (!settlement.dueDate || settlement.dueDate > date) continue;
      const id = `due-settlement-${settlement.id}-${date}`;
      if (notificationExists(notifications, id)) continue;
      additions.push({ id, type: "Warning", title: `Settlement due · ${customerName(business, settlement.customerId)}`, description: `${settlement.periodStart} to ${settlement.periodEnd} requires verification or payment.`, href: "/sales?tab=settlements", entityId: settlement.id, dueDate: settlement.dueDate, read: false, createdAt: now() });
    }

    for (const project of business.projects.filter((item) => !["Completed", "On hold"].includes(item.status))) {
      if (!project.dueDate || project.dueDate < date || project.dueDate > upcoming) continue;
      const id = `due-project-${project.id}-${date}`;
      if (notificationExists(notifications, id)) continue;
      additions.push({ id, type: "Reminder", title: `Project due soon · ${customerName(business, project.customerId)}`, description: `${project.name} is due ${project.dueDate} and is ${project.progress}% complete.`, href: "/sales?tab=projects", entityId: project.id, dueDate: project.dueDate, read: false, createdAt: now() });
    }

    for (const opportunity of business.opportunities.filter((item) => !["Won", "Lost"].includes(item.stage))) {
      if (!opportunity.dueDate || opportunity.dueDate > date) continue;
      const id = `due-opportunity-${opportunity.id}-${date}`;
      if (notificationExists(notifications, id)) continue;
      additions.push({ id, type: "Reminder", title: `CRM follow-up due · ${customerName(business, opportunity.customerId)}`, description: opportunity.nextAction || opportunity.title, href: "/sales?tab=crm", entityId: opportunity.id, dueDate: opportunity.dueDate, read: false, createdAt: now() });
    }

    if (additions.length) {
      localStorage.setItem(NOTIFICATION_KEY, JSON.stringify([...additions, ...notifications].slice(0, 500)));
      updatedKeys.add(NOTIFICATION_KEY);
    }
    return `${additions.length} due-date notification${additions.length === 1 ? "" : "s"} created.`;
  }

  return `Action ${action} completed.`;
}

function executeRecipe(recipe: AutomationRecipe, event: AutomationEvent) {
  const run: AutomationRun = {
    id: automationId("run"),
    recipeId: recipe.id,
    recipeName: recipe.name,
    eventId: event.id,
    trigger: event.trigger,
    entityId: event.entityId,
    startedAt: now(),
    status: "Success",
    actions: recipe.actions,
    summary: ""
  };
  appendRun(run);

  const updatedKeys = new Set<string>();
  try {
    const summaries = recipe.actions.map((action) => executeAction(action, event, updatedKeys));
    updateRun(run.id, { status: "Success", finishedAt: now(), summary: summaries.join(" ") });
    updateRecipeRun(recipe.id);
    markProcessed(`${recipe.id}:${event.id}`);
    window.dispatchEvent(new CustomEvent(AUTOMATION_DATA_UPDATED, { detail: { keys: Array.from(updatedKeys), runId: run.id } }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation error";
    updateRun(run.id, { status: "Failed", finishedAt: now(), summary: "Automation failed.", error: message });
    markProcessed(`${recipe.id}:${event.id}`);
  }
}

function queueRecipe(recipe: AutomationRecipe, event: AutomationEvent) {
  const key = `${recipe.id}:${event.id}`;
  if (isProcessed(key)) return;
  const approval: AutomationApproval = {
    id: automationId("approval"),
    recipeId: recipe.id,
    recipeName: recipe.name,
    event,
    status: "Pending",
    createdAt: now()
  };
  appendApproval(approval);
  appendRun({
    id: automationId("run"),
    recipeId: recipe.id,
    recipeName: recipe.name,
    eventId: event.id,
    trigger: event.trigger,
    entityId: event.entityId,
    startedAt: now(),
    status: "Pending approval",
    actions: recipe.actions,
    summary: "Waiting for human approval."
  });
  markProcessed(key);
  window.dispatchEvent(new CustomEvent(AUTOMATION_DATA_UPDATED, { detail: { keys: [AUTOMATION_APPROVAL_KEY, AUTOMATION_RUN_KEY] } }));
}

function processEvent(event: AutomationEvent) {
  const recipes = readRecipes().filter((recipe) => recipe.status === "Active" && recipe.trigger === event.trigger);
  for (const recipe of recipes) {
    const key = `${recipe.id}:${event.id}`;
    if (isProcessed(key)) continue;
    if (recipe.approvalRequired) queueRecipe(recipe, event);
    else executeRecipe(recipe, event);
  }
}

function buildEvent(trigger: AutomationTrigger, entity: any, source: AutomationEvent["source"] = "detected"): AutomationEvent {
  const entityId = String(entity?.id || trigger);
  const version = String(entity?.updatedAt || entity?.createdAt || (trigger === "daily.scan" ? today() : now()));
  return {
    id: `${trigger}:${entityId}:${version}`,
    trigger,
    entityId,
    occurredAt: now(),
    payload: clone(entity || {}),
    source
  };
}

function currentSnapshot(): Snapshot {
  return {
    business: readBusiness(),
    funnels: parse<any[]>(localStorage.getItem(FUNNEL_KEY), []),
    knowledge: readKnowledge(),
    documents: parse<any[]>(localStorage.getItem(GENERATED_DOCUMENT_KEY), [])
  };
}

function findLatestCandidate(trigger: AutomationTrigger) {
  const snapshot = currentSnapshot();
  if (trigger === "customer.created") return snapshot.business.customers[0];
  if (trigger === "opportunity.won") return snapshot.business.opportunities.filter((item) => item.stage === "Won").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (trigger === "invoice.paid") return snapshot.business.documents.filter((item) => item.type === "Invoice" && item.status === "Paid").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (trigger === "settlement.paid") return snapshot.business.settlements.filter((item) => item.status === "Paid").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (trigger === "onboarding.completed") return snapshot.business.onboardings.filter((item) => item.status === "Completed").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (trigger === "project.completed") return snapshot.business.projects.filter((item) => item.status === "Completed").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (trigger === "funnel.created") return snapshot.funnels.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (trigger === "funnel.activated") return snapshot.funnels.filter((item) => item.status === "Active").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (trigger === "knowledge.created") return snapshot.knowledge.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (trigger === "document.generated") return snapshot.documents.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (trigger === "daily.scan") return { id: today(), updatedAt: today() };
  return null;
}

export function AutomationRuntime() {
  const pathname = usePathname();
  const previous = useRef<Snapshot | null>(null);

  useEffect(() => {
    readRecipes();
    previous.current = currentSnapshot();

    const scheduledEvent = buildEvent("daily.scan", { id: today(), updatedAt: today() }, "scheduled");
    processEvent(scheduledEvent);

    const scan = () => {
      const before = previous.current;
      const after = currentSnapshot();
      if (!before) {
        previous.current = after;
        return;
      }

      const oldCustomers = new Map(before.business.customers.map((item) => [item.id, item]));
      after.business.customers.filter((item) => !oldCustomers.has(item.id)).forEach((item) => processEvent(buildEvent("customer.created", item)));

      const oldOpportunities = new Map(before.business.opportunities.map((item) => [item.id, item]));
      after.business.opportunities.filter((item) => item.stage === "Won" && oldOpportunities.get(item.id)?.stage !== "Won").forEach((item) => processEvent(buildEvent("opportunity.won", item)));

      const oldDocuments = new Map(before.business.documents.map((item) => [item.id, item]));
      after.business.documents.filter((item) => item.type === "Invoice" && item.status === "Paid" && oldDocuments.get(item.id)?.status !== "Paid").forEach((item) => processEvent(buildEvent("invoice.paid", item)));

      const oldSettlements = new Map(before.business.settlements.map((item) => [item.id, item]));
      after.business.settlements.filter((item) => item.status === "Paid" && oldSettlements.get(item.id)?.status !== "Paid").forEach((item) => processEvent(buildEvent("settlement.paid", item)));

      const oldOnboardings = new Map(before.business.onboardings.map((item) => [item.id, item]));
      after.business.onboardings.filter((item) => item.status === "Completed" && oldOnboardings.get(item.id)?.status !== "Completed").forEach((item) => processEvent(buildEvent("onboarding.completed", item)));

      const oldProjects = new Map(before.business.projects.map((item) => [item.id, item]));
      after.business.projects.filter((item) => item.status === "Completed" && oldProjects.get(item.id)?.status !== "Completed").forEach((item) => processEvent(buildEvent("project.completed", item)));

      const oldFunnels = new Map(before.funnels.map((item) => [item.id, item]));
      after.funnels.filter((item) => !oldFunnels.has(item.id)).forEach((item) => processEvent(buildEvent("funnel.created", item)));
      after.funnels.filter((item) => item.status === "Active" && oldFunnels.get(item.id)?.status !== "Active").forEach((item) => processEvent(buildEvent("funnel.activated", item)));

      const oldKnowledge = new Map(before.knowledge.map((item) => [item.id, item]));
      after.knowledge.filter((item) => !oldKnowledge.has(item.id)).forEach((item) => processEvent(buildEvent("knowledge.created", item)));

      const oldGenerated = new Map(before.documents.map((item) => [item.id, item]));
      after.documents.filter((item) => !oldGenerated.has(item.id)).forEach((item) => processEvent(buildEvent("document.generated", item)));

      previous.current = currentSnapshot();
    };

    const interval = window.setInterval(scan, 1200);

    const manualRun = (raw: Event) => {
      const detail = (raw as CustomEvent<{ recipeId: string }>).detail;
      const recipe = readRecipes().find((item) => item.id === detail?.recipeId);
      if (!recipe) return;
      const candidate = findLatestCandidate(recipe.trigger);
      if (!candidate) {
        appendRun({ id: automationId("run"), recipeId: recipe.id, recipeName: recipe.name, eventId: `manual-empty:${now()}`, trigger: recipe.trigger, entityId: "none", startedAt: now(), finishedAt: now(), status: "Skipped", actions: recipe.actions, summary: "No matching record is available for this trigger." });
        window.dispatchEvent(new CustomEvent(AUTOMATION_DATA_UPDATED, { detail: { keys: [AUTOMATION_RUN_KEY] } }));
        return;
      }
      const event = buildEvent(recipe.trigger, { ...candidate, updatedAt: now() }, "manual");
      if (recipe.approvalRequired) queueRecipe(recipe, event);
      else executeRecipe(recipe, event);
    };

    const approvalRun = (raw: Event) => {
      const detail = (raw as CustomEvent<{ approvalId: string; decision: "Approved" | "Rejected" }>).detail;
      const approvals = parse<AutomationApproval[]>(localStorage.getItem(AUTOMATION_APPROVAL_KEY), []);
      const approval = approvals.find((item) => item.id === detail?.approvalId);
      if (!approval || approval.status !== "Pending") return;
      markApproval(approval.id, detail.decision);
      if (detail.decision === "Rejected") {
        appendRun({ id: automationId("run"), recipeId: approval.recipeId, recipeName: approval.recipeName, eventId: approval.event.id, trigger: approval.event.trigger, entityId: approval.event.entityId, startedAt: now(), finishedAt: now(), status: "Rejected", actions: [], summary: "Automation rejected by user." });
      } else {
        const recipe = readRecipes().find((item) => item.id === approval.recipeId);
        if (recipe) executeRecipe({ ...recipe, approvalRequired: false }, { ...approval.event, id: `${approval.event.id}:approved:${approval.id}` });
      }
      window.dispatchEvent(new CustomEvent(AUTOMATION_DATA_UPDATED, { detail: { keys: [AUTOMATION_APPROVAL_KEY, AUTOMATION_RUN_KEY] } }));
    };

    window.addEventListener(AUTOMATION_RUN_REQUEST, manualRun);
    window.addEventListener(AUTOMATION_APPROVAL_REQUEST, approvalRun);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(AUTOMATION_RUN_REQUEST, manualRun);
      window.removeEventListener(AUTOMATION_APPROVAL_REQUEST, approvalRun);
    };
  }, []);

  useEffect(() => {
    const refresh = (raw: Event) => {
      const keys = ((raw as CustomEvent<{ keys: string[] }>).detail?.keys || []);
      const relevant =
        (pathname === "/business" && keys.includes(BUSINESS_STORAGE_KEY)) ||
        (pathname === "/knowledge" && keys.includes(KNOWLEDGE_STORAGE_KEY)) ||
        (pathname === "/funnels" && keys.includes(FUNNEL_KEY));
      if (relevant) window.setTimeout(() => window.location.reload(), 250);
    };
    window.addEventListener(AUTOMATION_DATA_UPDATED, refresh);
    return () => window.removeEventListener(AUTOMATION_DATA_UPDATED, refresh);
  }, [pathname]);

  return null;
}
