"use client";

import { useMemo, useState } from "react";
import { Copy, Eye, FilePenLine, Plus, Trash2 } from "lucide-react";
import { AIWritingButton } from "@/components/ai-writing-button";
import { DateInput } from "@/components/date-input";
import { PrintDocument, PRINT_STYLES } from "@/components/print-document";
import { Button } from "@/components/ui/button";
import {
  computeTotals, defaultSettings, emptyLineItem, lineAmount, parseLineItems,
  serialiseLineItems, LINE_ITEMS_STATE_KEY, type LineItem, type LineItemState,
} from "@/lib/line-items";
import {
  adaptPrintTemplate, buildPrintModel, printTemplateBaseType,
  type PrintCompany, type PrintDocument as PrintableRecord, type PrintTemplate,
} from "@/lib/print-templates";
import { cn } from "@/lib/utils";

export const SALES_DOCUMENT_TYPES = [
  "Cash Sale", "Quotation", "Sales Order", "Delivery Order",
  "Proforma Invoice", "Invoice", "Receipt", "Credit Note",
] as const;

export type SalesPrintSetup = { company: PrintCompany; templates: PrintTemplate[] };

const inputClass = "h-12 w-full rounded-xl border border-[#d9d3c7] bg-white px-3 text-sm outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10";
const textareaClass = "min-h-24 w-full rounded-xl border border-[#d9d3c7] bg-white px-3 py-3 text-sm outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10";

const fallbackCompany: PrintCompany = {
  name: "Kretivco Mediaworks",
  registrationNumber: "",
  addressLines: [],
  email: "",
  phone: "",
  logoUrl: "/kretivco-logo.png",
};

function fallbackTemplate(documentType: string): PrintTemplate {
  const base = printTemplateBaseType(documentType);
  return adaptPrintTemplate({
    documentType: base,
    heading: base.toUpperCase(),
    numberLabel: `${base} No#`,
    notes: [],
    closingLine: "",
    showSignatures: base !== "Receipt",
    issuedByLabel: "Issued by:",
    acceptedByLabel: "Accepted by:",
    bankName: "",
    bankAccountNumber: "",
    paymentTermsDays: 14,
  }, documentType);
}

export function salesLineState(record: any): LineItemState {
  const restored = parseLineItems(record?.content?.[LINE_ITEMS_STATE_KEY]);
  if (restored?.items.length) return restored;
  // Older records stored only a grand total. Remove delivery before seeding the
  // first priced row so reopening one cannot charge delivery twice.
  const legacyValue = Math.max(0, Number(record?.value || 0) - Number(record?.deliveryAmount || 0));
  return {
    items: [{
      ...emptyLineItem(),
      description: legacyValue ? String(record?.title || "Services") : "",
      unitPrice: legacyValue,
    }],
    settings: { ...defaultSettings },
  };
}

export function applySalesLineState(record: any, state: LineItemState, deliveryValue = record?.deliveryAmount) {
  const deliveryAmount = Number(deliveryValue || 0);
  const totals = computeTotals(state.items, state.settings);
  return {
    ...record,
    deliveryAmount,
    value: Math.round((totals.total + deliveryAmount) * 100) / 100,
    content: {
      ...(record?.content && typeof record.content === "object" ? record.content : {}),
      [LINE_ITEMS_STATE_KEY]: serialiseLineItems(state),
    },
  };
}

export function initialiseSalesRecord(record: any) {
  return applySalesLineState(record, salesLineState(record));
}

export function SalesDocumentEditor({
  record,
  customers,
  printSetup,
  onChange,
}: {
  record: any;
  customers: any[];
  printSetup: SalesPrintSetup | null;
  onChange: (record: any) => void;
}) {
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const state = useMemo(() => salesLineState(record), [record]);
  const totals = computeTotals(state.items, state.settings);
  const grandTotal = totals.total + Number(record.deliveryAmount || 0);

  const setField = (key: string, value: any) => onChange({ ...record, [key]: value });
  const setState = (next: LineItemState) => onChange(applySalesLineState(record, next));
  const setDelivery = (value: string) => onChange(applySalesLineState(record, state, value));
  const setContentField = (key: string, value: string) => onChange({
    ...record,
    content: { ...(record.content || {}), [key]: value },
  });

  const updateItem = (id: string, patch: Partial<LineItem>) => setState({
    ...state,
    items: state.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  });
  const removeItem = (id: string) => setState({
    ...state,
    items: state.items.length === 1 ? state.items : state.items.filter((item) => item.id !== id),
  });
  const duplicateItem = (item: LineItem) => setState({
    ...state,
    items: [...state.items, { ...item, id: emptyLineItem().id }],
  });

  const customer = customers.find((item) => item.id === record.customerId);
  const template = useMemo(() => {
    const templates = printSetup?.templates || [];
    const exact = templates.find((item) => item.documentType === record.type);
    const base = exact || templates.find((item) => item.documentType === printTemplateBaseType(record.type));
    return base ? adaptPrintTemplate(base, record.type) : fallbackTemplate(record.type);
  }, [printSetup, record.type]);
  const model = useMemo(() => {
    const printable: PrintableRecord = {
      type: record.type,
      number: record.reference || "DRAFT",
      date: record.issueDate || "",
      issuedBy: "Kretivco Team",
      customerName: customer?.name || "Customer",
      customerAddressLines: [
        customer?.addressLine1,
        customer?.addressLine2,
        [customer?.postcode, customer?.city, customer?.stateCode].filter(Boolean).join(", "),
      ].filter(Boolean),
      title: record.title || "",
      items: state.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity || 0),
        unit: item.unit,
        unitPrice: Number(item.unitPrice || 0),
      })),
      subtotal: totals.subtotal,
      deliveryAmount: Number(record.deliveryAmount || 0),
      discountAmount: totals.discountAmount,
      taxLabel: state.settings.taxRate ? `${state.settings.taxLabel} (${state.settings.taxRate}%)` : state.settings.taxLabel,
      taxAmount: totals.taxAmount,
      total: grandTotal,
      amountPaid: record.type === "Receipt" ? grandTotal : undefined,
      balanceDue: record.type === "Receipt" ? 0 : undefined,
      paymentMethod: record.type === "Receipt" ? String(record.content?.paymentMethod || "") : undefined,
    };
    return buildPrintModel(printable, printSetup?.company || fallbackCompany, template);
  }, [customer, grandTotal, printSetup, record, state, template, totals]);

  return <>
    <style>{`${PRINT_STYLES}
      .sales-preview-paper { width: 210mm; min-height: 297mm; padding: 18mm 20mm; zoom: .40; }
      @media (min-width: 640px) { .sales-preview-paper { zoom: .58; } }
      @media (min-width: 1024px) { .sales-preview-paper { zoom: .44; } }
      @media (min-width: 1440px) { .sales-preview-paper { zoom: .52; } }
    `}</style>

    <div className="mb-4 grid grid-cols-2 gap-2 lg:hidden">
      <Button type="button" variant={mobilePane === "edit" ? "default" : "outline"} onClick={() => setMobilePane("edit")}>
        <FilePenLine className="h-4 w-4" />Edit
      </Button>
      <Button type="button" variant={mobilePane === "preview" ? "default" : "outline"} onClick={() => setMobilePane("preview")}>
        <Eye className="h-4 w-4" />Preview
      </Button>
    </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,.86fr)]">
      <div className={cn("space-y-5", mobilePane === "preview" && "hidden lg:block")}>
        <section className="grid gap-4 sm:grid-cols-2">
          <SalesField label="Customer">
            <select value={record.customerId} onChange={(event) => setField("customerId", event.target.value)} className={inputClass}>
              {customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </SalesField>
          <SalesField label="Document type">
            <select value={record.type} onChange={(event) => setField("type", event.target.value)} className={inputClass}>
              {SALES_DOCUMENT_TYPES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </SalesField>
          <SalesField label="Status">
            <select value={record.status} onChange={(event) => setField("status", event.target.value)} className={inputClass}>
              {["Draft", "Sent", "Approved", "Paid", "Overdue", "Cancelled"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </SalesField>
          <SalesField label="Reference">
            <input value={record.reference} onChange={(event) => setField("reference", event.target.value)} className={inputClass} placeholder="Auto or enter reference" />
          </SalesField>
          <SalesField label="Title" wide improveValue={record.title} onImprove={(value) => setField("title", value)}>
            <input value={record.title} onChange={(event) => setField("title", event.target.value)} className={inputClass} placeholder="Project or job title" />
          </SalesField>
          <SalesField label="Issue date"><DateInput value={record.issueDate} onChange={(event) => setField("issueDate", event.target.value)} /></SalesField>
          <SalesField label="Due date"><DateInput value={record.dueDate} onChange={(event) => setField("dueDate", event.target.value)} /></SalesField>
          {record.type === "Receipt" && <SalesField label="Payment method">
            <input value={record.content?.paymentMethod || ""} onChange={(event) => setContentField("paymentMethod", event.target.value)} className={inputClass} placeholder="Bank transfer, cash…" />
          </SalesField>}
        </section>

        <section className="rounded-2xl border bg-white/70 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="font-semibold">Items</h3><p className="mt-1 text-xs text-muted-foreground">Add the actual products, services, quantity and price shown to the customer.</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => setState({ ...state, items: [...state.items, emptyLineItem()] })}><Plus className="h-4 w-4" />Add item</Button>
          </div>

          <div className="mt-4 hidden grid-cols-[minmax(180px,1fr)_75px_95px_120px_110px_76px] gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Description</span><span>Qty</span><span>Unit</span><span>Unit price</span><span className="text-right">Amount</span><span />
          </div>
          <div className="mt-2 space-y-3">
            {state.items.map((item, index) => <div key={item.id} className="grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-[minmax(180px,1fr)_75px_95px_120px_110px_76px] md:items-start md:gap-2">
              <label className="text-xs font-medium md:text-[0px]"><span className="mb-1 block md:hidden">Description</span><textarea aria-label={`Item ${index + 1} description`} value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[#ba5c42] md:min-h-12" placeholder="Product or service description" /></label>
              <label className="text-xs font-medium"><span className="mb-1 block md:hidden">Quantity</span><input aria-label={`Item ${index + 1} quantity`} type="number" min="0" step="0.01" value={item.quantity || ""} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} className="h-12 w-full rounded-lg border px-2 text-sm outline-none focus:border-[#ba5c42]" /></label>
              <label className="text-xs font-medium"><span className="mb-1 block md:hidden">Unit</span><input aria-label={`Item ${index + 1} unit`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="h-12 w-full rounded-lg border px-2 text-sm outline-none focus:border-[#ba5c42]" placeholder="unit" /></label>
              <label className="text-xs font-medium"><span className="mb-1 block md:hidden">Unit price (RM)</span><input aria-label={`Item ${index + 1} unit price`} type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value) })} className="h-12 w-full rounded-lg border px-2 text-sm outline-none focus:border-[#ba5c42]" placeholder="0.00" /></label>
              <div className="flex h-12 items-center justify-between rounded-lg bg-[#f7f4ed] px-3 text-sm font-semibold md:justify-end"><span className="text-xs font-medium text-muted-foreground md:hidden">Amount</span>{money(lineAmount(item))}</div>
              <div className="flex gap-1 md:justify-end"><Button type="button" variant="ghost" size="icon" title="Duplicate item" onClick={() => duplicateItem(item)}><Copy className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title="Remove item" disabled={state.items.length === 1} onClick={() => removeItem(item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>
            </div>)}
          </div>
          <Button type="button" variant="outline" className="mt-3 w-full border-dashed" onClick={() => setState({ ...state, items: [...state.items, emptyLineItem()] })}><Plus className="h-4 w-4" />Add another item</Button>
        </section>

        <section className="grid gap-4 rounded-2xl border bg-white/70 p-4 sm:grid-cols-2 sm:p-5">
          <SalesField label="Discount (%)"><input type="number" min="0" max="100" step="0.01" value={state.settings.discountPercent || ""} onChange={(event) => setState({ ...state, settings: { ...state.settings, discountPercent: Number(event.target.value) } })} className={inputClass} placeholder="0" /></SalesField>
          <SalesField label="Delivery charge (RM)"><input type="number" min="0" step="0.01" value={record.deliveryAmount || ""} onChange={(event) => setDelivery(event.target.value)} className={inputClass} placeholder="0.00" /></SalesField>
          <SalesField label="Tax label"><input value={state.settings.taxLabel} onChange={(event) => setState({ ...state, settings: { ...state.settings, taxLabel: event.target.value } })} className={inputClass} placeholder="SST" /></SalesField>
          <SalesField label="Tax rate (%)"><input type="number" min="0" max="100" step="0.01" value={state.settings.taxRate || ""} onChange={(event) => setState({ ...state, settings: { ...state.settings, taxRate: Number(event.target.value) } })} className={inputClass} placeholder="0" /></SalesField>
          <SalesField label="Notes" wide improveValue={record.notes} onImprove={(value) => setField("notes", value)}><textarea value={record.notes} onChange={(event) => setField("notes", event.target.value)} className={textareaClass} placeholder="Payment terms, delivery notes or customer-facing remarks" /></SalesField>
          <div className="sm:col-span-2 rounded-xl bg-[#202c25] p-4 text-white">
            <TotalRow label="Subtotal" value={totals.subtotal} />
            {totals.discountAmount > 0 && <TotalRow label="Discount" value={-totals.discountAmount} />}
            {totals.taxAmount > 0 && <TotalRow label={state.settings.taxLabel || "Tax"} value={totals.taxAmount} />}
            {Number(record.deliveryAmount || 0) > 0 && <TotalRow label="Delivery" value={Number(record.deliveryAmount)} />}
            <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3"><span className="font-semibold">Total (MYR)</span><span className="text-xl font-semibold">{money(grandTotal)}</span></div>
          </div>
        </section>
      </div>

      <aside className={cn("min-w-0", mobilePane === "edit" && "hidden lg:block")}>
        <div className="sticky top-24 rounded-2xl border bg-[#e8e4da] p-3">
          <div className="mb-3 flex items-center justify-between px-1"><div><div className="text-sm font-semibold">Live preview</div><div className="text-[10px] text-muted-foreground">Updates before you save</div></div><Eye className="h-4 w-4 text-muted-foreground" /></div>
          <div className="max-h-[70vh] overflow-auto rounded-lg bg-[#d8d4ca] p-3">
            <div className="sales-preview-paper mx-auto bg-white shadow-xl"><PrintDocument model={model} /></div>
          </div>
        </div>
      </aside>
    </div>
  </>;
}

function SalesField({ label, wide, improveValue, onImprove, children }: { label: string; wide?: boolean; improveValue?: string; onImprove?: (value: string) => void; children: React.ReactNode }) {
  return <label className={cn("block text-sm font-medium", wide && "sm:col-span-2")}><span className="mb-2 flex min-h-8 items-center justify-between gap-2"><span>{label}</span>{onImprove && <AIWritingButton value={improveValue || ""} field={label} context="KretivOS customer-facing commercial document. Preserve names, quantities, prices, dates, references, commitments and legal meaning. Keep it concise and professional." onApply={onImprove} />}</span>{children}</label>;
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between py-1 text-sm text-white/75"><span>{label}</span><span>{money(value)}</span></div>;
}

function money(value: number) {
  return `RM${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
