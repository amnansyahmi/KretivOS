"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Copy, FileText, ImagePlus, Plus, Printer, Save,
  Settings2, Table2, Trash2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/markdown-preview";
import {
  COMPUTED_VARIABLES, LINE_ITEMS_STATE_KEY, LINE_ITEMS_VARIABLE, LineItem,
  LineItemSettings, LineItemState, computeTotals, defaultSettings, emptyLineItem,
  formatMoney, lineAmount, lineItemValues, parseLineItems, serialiseLineItems,
} from "@/lib/line-items";

export type DocumentLayout = "proposal" | "letterhead" | "commercial" | "report" | "plain";

export type DocumentBrandProfile = {
  logoDataUrl: string;
  companyName: string;
  registrationNo: string;
  phone: string;
  email: string;
  address: string;
};

export type DocumentSavePayload = {
  html: string;
  layout: DocumentLayout;
  brand: DocumentBrandProfile;
  values: Record<string, string>;
};

const CURRENCIES = ["RM", "$", "€", "£", "S$", "IDR ", "฿"];
const UNITS = ["", "unit", "pcs", "hour", "day", "month", "project", "package", "post", "video", "page"];

type DocumentComposerProps = {
  template: {
    id: string;
    name: string;
    category: string;
    content: string;
  };
  variables: string[];
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  documentTitle: string;
  onDocumentTitleChange: (title: string) => void;
  generatedContent: string;
  onClose: () => void;
  onSave: (payload: DocumentSavePayload) => void;
};

const BRAND_KEY = "kretivos-document-brand";

const defaultBrand: DocumentBrandProfile = {
  logoDataUrl: "",
  companyName: "Kretivco Mediaworks",
  registrationNo: "201803023252 (SA0463354-A)",
  phone: "+6011-2114 9204",
  email: "kretivco@gmail.com",
  address: "No.15A, Jalan USJ1/19, 47600 Subang Jaya, Selangor.",
};

const layoutOptions: { value: DocumentLayout; label: string; note: string }[] = [
  { value: "proposal", label: "Kretivco Proposal", note: "Magenta and orange campaign proposal design" },
  { value: "letterhead", label: "Kretivco Letterhead", note: "Official letter and internal memo layout" },
  { value: "commercial", label: "Commercial Document", note: "Quotation, invoice, receipt and sales documents" },
  { value: "report", label: "Corporate Report", note: "Marketing plans, reports and strategy documents" },
  { value: "plain", label: "Clean Document", note: "Minimal reusable A4 layout" },
];

function initialLayout(category: string): DocumentLayout {
  const value = category.toLowerCase();
  if (value.includes("proposal")) return "proposal";
  if (value.includes("internal") || value.includes("memo") || value.includes("letter")) return "letterhead";
  if (value.includes("sales") || value.includes("finance") || value.includes("invoice") || value.includes("quotation")) return "commercial";
  if (value.includes("strategy") || value.includes("creative") || value.includes("report")) return "report";
  return "plain";
}

function prettyLabel(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const exportCss = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; color: #242a25; font-family: Arial, Helvetica, sans-serif; }
  .kdoc-page { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto; overflow: hidden; background: #fff; padding: 31mm 19mm 24mm; }
  .kdoc-header { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14mm; }
  .kdoc-brand { display: flex; align-items: center; gap: 12px; }
  .kdoc-logo { display: block; max-width: 54mm; max-height: 20mm; object-fit: contain; }
  .kdoc-fallback-logo { display: flex; height: 14mm; width: 14mm; align-items: center; justify-content: center; border-radius: 4mm; background: #d71961; color: #fff; font-size: 21px; font-weight: 800; }
  .kdoc-company { font-size: 17px; font-weight: 700; color: #252a26; }
  .kdoc-registration { margin-top: 2px; font-size: 9px; color: #777; }
  .kdoc-contact { max-width: 80mm; text-align: right; font-size: 8.5px; line-height: 1.55; color: #676d68; }
  .kdoc-body { position: relative; z-index: 2; padding-bottom: 18mm; }
  .kdoc-body h1 { margin: 0 0 7mm; text-align: center; font-size: 23px; line-height: 1.2; color: #252a26; }
  .kdoc-body h2 { margin: 7mm 0 3mm; font-size: 17px; line-height: 1.25; color: #d71961; }
  .kdoc-body h3 { margin: 6mm 0 2.5mm; font-size: 14px; color: #252a26; }
  .kdoc-body p, .kdoc-body li { margin: 0 0 3mm; font-size: 10.5pt; line-height: 1.62; color: #4b514c; }
  .kdoc-body ul { margin: 2mm 0 4mm; padding-left: 6mm; }
  .kdoc-body strong { color: #292e2a; }
  .kdoc-body blockquote { margin: 5mm 0; border-left: 3px solid #ffb136; background: #fbf7f2; padding: 4mm 5mm; color: #555; }
  .kdoc-body table { width: 100%; min-width: 0; border-collapse: collapse; margin: 4mm 0 5mm; page-break-inside: auto; }
  .kdoc-body table tr { page-break-inside: avoid; page-break-after: auto; }
  .kdoc-body th { border-bottom: .7mm solid #26342b; background: #f2efe8; padding: 2.4mm 3mm; font-size: 9pt; font-weight: 700; color: #252a26; }
  .kdoc-body td { border-bottom: .2mm solid #e3ded4; padding: 2.2mm 3mm; font-size: 9.5pt; line-height: 1.5; color: #4b514c; }
  .kdoc-body .md-align-right { text-align: right; }
  .kdoc-body .md-align-center { text-align: center; }
  .kdoc-body .md-align-left { text-align: left; }
  .kdoc-body table + p { margin-top: 0; }
  .kdoc-footer { position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; display: flex; min-height: 14mm; align-items: center; justify-content: space-between; gap: 10px; padding: 3mm 18mm; background: #d71961; color: #fff; font-size: 8px; }
  .kdoc-topbar { position: absolute; z-index: 1; top: 0; right: 0; left: 0; height: 12mm; background: #d71961; }
  .kdoc-orange { position: absolute; z-index: 1; top: 0; right: 0; width: 38%; height: 12mm; background: #ffb136; clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 30%); }
  .kdoc-letter-shape-one { position: absolute; z-index: 1; top: 0; right: 0; width: 62%; height: 28mm; background: #d71961; clip-path: polygon(20% 0, 100% 0, 100% 100%, 62% 52%, 0 20%); }
  .kdoc-letter-shape-two { position: absolute; z-index: 1; top: 0; right: 0; width: 47%; height: 25mm; background: #ffb136; clip-path: polygon(34% 0, 100% 0, 100% 100%, 0 0); opacity: .92; }
  .kdoc-letterhead .kdoc-header { margin-top: 5mm; margin-bottom: 17mm; }
  .kdoc-commercial { border-top: 7mm solid #26342b; }
  .kdoc-commercial .kdoc-header { border-bottom: 1px solid #ddd8cf; padding-bottom: 6mm; }
  .kdoc-commercial .kdoc-footer { background: #26342b; }
  .kdoc-report { border-top: 5mm solid #d71961; }
  .kdoc-report .kdoc-header { border-bottom: 2px solid #ffb136; padding-bottom: 5mm; }
  .kdoc-plain .kdoc-footer { background: #26342b; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kdoc-page { margin: 0; box-shadow: none; }
  }
`;

function buildExportDocument(title: string, previewHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${exportCss}</style></head><body>${previewHtml}</body></html>`;
}

export function DocumentComposer({
  template,
  variables,
  values,
  onValuesChange,
  documentTitle,
  onDocumentTitleChange,
  generatedContent,
  onClose,
  onSave,
}: DocumentComposerProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<DocumentLayout>(() => initialLayout(template.category));
  const [brand, setBrand] = useState<DocumentBrandProfile>(defaultBrand);
  const [notice, setNotice] = useState("");
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const [previewScale, setPreviewScale] = useState(1);
  const [previewHeight, setPreviewHeight] = useState<number | undefined>(undefined);

  // The A4 page has a fixed 210mm width, so it is scaled down to whatever room
  // the pane actually has. Measuring beats hardcoded breakpoints here because the
  // pane width depends on the sidebar, the viewport and the active mobile tab.
  useEffect(() => {
    const shell = previewShellRef.current;
    const page = previewRef.current;
    if (!shell || !page) return;

    const fit = () => {
      const available = shell.clientWidth - 2 * parseFloat(getComputedStyle(shell).paddingLeft || "0");
      const pageWidth = page.offsetWidth;
      if (!available || !pageWidth) return;
      const next = Math.min(1, available / pageWidth);
      setPreviewScale(next);
      setPreviewHeight(page.offsetHeight * next);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(shell);
    observer.observe(page);
    return () => observer.disconnect();
  }, [mobilePane, layout, generatedContent, brand]);

  const usesLineItems = variables.includes(LINE_ITEMS_VARIABLE);

  // Rows are restored from the saved document when one is reopened.
  const [lineState, setLineState] = useState<LineItemState>(() => {
    const restored = parseLineItems(values[LINE_ITEMS_STATE_KEY]);
    if (restored) return restored;
    return { items: [emptyLineItem()], settings: { ...defaultSettings } };
  });

  const totals = useMemo(() => computeTotals(lineState.items, lineState.settings), [lineState]);

  // Keep the flat template variables in step with the structured rows, so
  // {{line_items}}, {{subtotal}}, {{tax}} and {{total}} render without manual entry.
  useEffect(() => {
    if (!usesLineItems) return;
    const derived = lineItemValues(lineState);
    const serialised = serialiseLineItems(lineState);
    const changed = Object.entries(derived).some(([key, value]) => values[key] !== value)
      || values[LINE_ITEMS_STATE_KEY] !== serialised;
    if (!changed) return;
    onValuesChange({ ...values, ...derived, [LINE_ITEMS_STATE_KEY]: serialised });
  }, [lineState, usesLineItems, values, onValuesChange]);

  function updateItem(id: string, patch: Partial<LineItem>) {
    setLineState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function updateSettings(patch: Partial<LineItemSettings>) {
    setLineState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  function addItem() {
    setLineState((current) => ({ ...current, items: [...current.items, emptyLineItem()] }));
  }

  function duplicateItem(id: string) {
    setLineState((current) => {
      const index = current.items.findIndex((item) => item.id === id);
      if (index < 0) return current;
      const copy = { ...current.items[index], id: emptyLineItem().id };
      const items = [...current.items];
      items.splice(index + 1, 0, copy);
      return { ...current, items };
    });
  }

  function removeItem(id: string) {
    setLineState((current) => {
      const items = current.items.filter((item) => item.id !== id);
      return { ...current, items: items.length ? items : [emptyLineItem()] };
    });
  }

  function moveItem(id: string, direction: -1 | 1) {
    setLineState((current) => {
      const index = current.items.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.items.length) return current;
      const items = [...current.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items };
    });
  }

  useEffect(() => {
    const saved = localStorage.getItem(BRAND_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as DocumentBrandProfile;
      setBrand({ ...defaultBrand, ...parsed });
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
  }, [brand]);

  const selectedLayout = useMemo(
    () => layoutOptions.find((item) => item.value === layout) || layoutOptions[0],
    [layout],
  );

  function updateBrand(key: keyof DocumentBrandProfile, value: string) {
    setBrand((current) => ({ ...current, [key]: value }));
  }

  function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Please choose a PNG, JPG, WEBP or SVG logo file.");
      return;
    }
    if (file.size > 1_500_000) {
      setNotice("Logo must be below 1.5 MB so it can be stored safely in the PWA.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateBrand("logoDataUrl", String(reader.result || ""));
      setNotice("Logo added to the reusable Kretivco brand profile.");
    };
    reader.readAsDataURL(file);
  }

  function exportHtml() {
    const preview = previewRef.current?.outerHTML || "";
    return buildExportDocument(documentTitle || template.name, preview);
  }

  function savePdf() {
    const popup = window.open("", "_blank", "width=900,height=1000");
    if (!popup) {
      setNotice("Your browser blocked the PDF window. Allow pop-ups for KretivOS and try again.");
      return;
    }
    popup.document.open();
    popup.document.write(exportHtml());
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 450);
    setNotice("Use the print window and choose “Save as PDF”.");
  }

  function saveWord() {
    const blob = new Blob(["\ufeff", exportHtml()], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(documentTitle || template.name)}.doc`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Word document downloaded with the current layout and logo.");
  }

  function saveDocument() {
    onSave({ html: exportHtml(), layout, brand, values });
    setNotice("Document saved to KretivOS.");
  }

  const pageClass = `kdoc-page kdoc-${layout}`;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <Card className="max-h-[98vh] w-full max-w-[1500px] overflow-y-auto rounded-b-none bg-[#f7f4ed] shadow-2xl sm:rounded-xl">
        <CardHeader className="sticky top-0 z-30 flex-row items-start justify-between border-b bg-[#f7f4ed]/95 p-4 backdrop-blur sm:p-6">
          <div>
            <CardTitle className="text-xl sm:text-2xl">Create from {template.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Edit content, apply the approved layout, add a logo, then save or export.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {notice && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

          <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{selectedLayout.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{selectedLayout.note}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={savePdf}><Printer className="h-4 w-4" />Save PDF</Button>
              <Button variant="outline" onClick={saveWord}><FileText className="h-4 w-4" />Word (.doc)</Button>
              <Button onClick={saveDocument}><Save className="h-4 w-4" />Save document</Button>
            </div>
          </div>

          {/* On small screens the editor and the A4 preview are separate panes
              rather than one very long scroll. */}
          <div className="mb-4 flex rounded-xl border bg-white p-1.5 xl:hidden">
            {(["edit", "preview"] as const).map((pane) => (
              <button
                key={pane}
                onClick={() => setMobilePane(pane)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium capitalize ${mobilePane === pane ? "bg-[#202c25] text-white" : "text-muted-foreground"}`}
              >
                {pane === "edit" ? <Settings2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{pane}
              </button>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[410px_minmax(0,1fr)]">
            <div className={`space-y-4 ${mobilePane === "edit" ? "" : "hidden xl:block"}`}>
              <Field label="Document title">
                <input value={documentTitle} onChange={(event) => onDocumentTitleChange(event.target.value)} className="doc-input" />
              </Field>

              <Field label="Document design">
                <select value={layout} onChange={(event) => setLayout(event.target.value as DocumentLayout)} className="doc-input">
                  {layoutOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>

              <details className="rounded-xl border bg-white" open>
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold"><Settings2 className="h-4 w-4 text-[#ba5c42]" />Brand, logo and letterhead</summary>
                <div className="space-y-4 border-t p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium hover:bg-[#f7f4ed]">
                      <ImagePlus className="h-4 w-4" />Upload logo
                      <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                    </label>
                    {brand.logoDataUrl && <Button variant="outline" size="sm" onClick={() => updateBrand("logoDataUrl", "")}><Trash2 className="h-3.5 w-3.5" />Remove</Button>}
                  </div>
                  <Field label="Company name"><input value={brand.companyName} onChange={(event) => updateBrand("companyName", event.target.value)} className="doc-input" /></Field>
                  <Field label="Registration number"><input value={brand.registrationNo} onChange={(event) => updateBrand("registrationNo", event.target.value)} className="doc-input" /></Field>
                  <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone"><input value={brand.phone} onChange={(event) => updateBrand("phone", event.target.value)} className="doc-input" /></Field><Field label="Email"><input value={brand.email} onChange={(event) => updateBrand("email", event.target.value)} className="doc-input" /></Field></div>
                  <Field label="Address"><textarea value={brand.address} onChange={(event) => updateBrand("address", event.target.value)} className="doc-textarea min-h-20" /></Field>
                </div>
              </details>

              {usesLineItems && <div className="rounded-xl border bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Table2 className="h-4 w-4 text-[#ba5c42]" />Line items</div>
                  <div className="text-xs text-muted-foreground">{lineState.items.length} {lineState.items.length === 1 ? "row" : "rows"}</div>
                </div>

                <div className="space-y-3 p-4">
                  {lineState.items.map((item, index) => <div key={item.id} className="rounded-xl border bg-[#fbfaf7] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item {index + 1}</span>
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => moveItem(item.id, -1)} disabled={index === 0} className="line-action" aria-label={`Move item ${index + 1} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => moveItem(item.id, 1)} disabled={index === lineState.items.length - 1} className="line-action" aria-label={`Move item ${index + 1} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => duplicateItem(item.id)} className="line-action" aria-label={`Duplicate item ${index + 1}`}><Copy className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => removeItem(item.id)} className="line-action line-action-danger" aria-label={`Remove item ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>

                    <textarea
                      value={item.description}
                      onChange={(event) => updateItem(item.id, { description: event.target.value })}
                      className="doc-textarea min-h-16"
                      placeholder="Description of the item or service"
                    />

                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <label className="block"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">Qty</span>
                        <input type="number" inputMode="decimal" min="0" step="any" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })} className="doc-input" />
                      </label>
                      <label className="block"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">Unit</span>
                        <input list="kdoc-units" value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="doc-input" placeholder="unit" />
                      </label>
                      <label className="col-span-2 block sm:col-span-1"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">Unit price ({lineState.settings.currency.trim()})</span>
                        <input type="number" inputMode="decimal" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value) })} className="doc-input" />
                      </label>
                    </div>

                    <div className="mt-2 flex items-center justify-between rounded-lg bg-[#f2efe8] px-3 py-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</span>
                      <span className="text-sm font-semibold">{formatMoney(lineState.settings.currency, lineAmount(item))}</span>
                    </div>
                  </div>)}

                  <datalist id="kdoc-units">{UNITS.filter(Boolean).map((unit) => <option key={unit} value={unit} />)}</datalist>

                  <Button variant="outline" className="w-full" onClick={addItem}><Plus className="h-4 w-4" />Add item</Button>
                </div>

                <div className="border-t p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">Currency</span>
                      <input list="kdoc-currencies" value={lineState.settings.currency} onChange={(event) => updateSettings({ currency: event.target.value })} className="doc-input" />
                    </label>
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">Discount %</span>
                      <input type="number" inputMode="decimal" min="0" max="100" step="any" value={lineState.settings.discountPercent} onChange={(event) => updateSettings({ discountPercent: Number(event.target.value) })} className="doc-input" />
                    </label>
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">Tax label</span>
                      <input value={lineState.settings.taxLabel} onChange={(event) => updateSettings({ taxLabel: event.target.value })} className="doc-input" placeholder="SST" />
                    </label>
                    <label className="block"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">Tax %</span>
                      <input type="number" inputMode="decimal" min="0" max="100" step="any" value={lineState.settings.taxRate} onChange={(event) => updateSettings({ taxRate: Number(event.target.value) })} className="doc-input" />
                    </label>
                  </div>
                  <datalist id="kdoc-currencies">{CURRENCIES.map((value) => <option key={value} value={value} />)}</datalist>

                  <div className="mt-4 space-y-1.5 rounded-xl bg-[#26342b] p-4 text-white">
                    <TotalRow label="Subtotal" value={formatMoney(lineState.settings.currency, totals.subtotal)} />
                    {totals.discountAmount > 0 && <TotalRow label={`Discount (${lineState.settings.discountPercent}%)`} value={`−${formatMoney(lineState.settings.currency, totals.discountAmount)}`} />}
                    {lineState.settings.taxRate > 0 && <TotalRow label={`${lineState.settings.taxLabel || "Tax"} (${lineState.settings.taxRate}%)`} value={formatMoney(lineState.settings.currency, totals.taxAmount)} />}
                    <div className="mt-2 flex items-center justify-between border-t border-white/15 pt-3">
                      <span className="text-sm font-medium">Total</span>
                      <span className="text-xl font-semibold">{formatMoney(lineState.settings.currency, totals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>}

              <div className="rounded-xl border bg-white p-4">
                <div className="mb-4 text-sm font-semibold">Document content</div>
                <div className="space-y-4">
                  {variables.map((variable) => {
                    if (usesLineItems && variable === LINE_ITEMS_VARIABLE) return null;

                    // Totals are derived from the rows above, so they are shown read-only.
                    if (usesLineItems && COMPUTED_VARIABLES.includes(variable)) {
                      return <Field key={variable} label={`${prettyLabel(variable)} · calculated`}>
                        <input value={values[variable] || ""} readOnly className="doc-input bg-[#f2efe8] text-muted-foreground" />
                      </Field>;
                    }

                    const compact = /(^date$|date$|reference|_no$|phone|email|status|total|amount|fee|budget|duration|aspect_ratio)/i.test(variable);
                    return <Field key={variable} label={prettyLabel(variable)}>
                      {compact
                        ? <input value={values[variable] || ""} onChange={(event) => onValuesChange({ ...values, [variable]: event.target.value })} className="doc-input" placeholder={`Enter ${prettyLabel(variable).toLowerCase()}`} />
                        : <textarea value={values[variable] || ""} onChange={(event) => onValuesChange({ ...values, [variable]: event.target.value })} className="doc-textarea" placeholder={`Enter ${prettyLabel(variable).toLowerCase()}`} />}
                    </Field>;
                  })}
                </div>
              </div>
            </div>

            <div className={`min-w-0 ${mobilePane === "preview" ? "" : "hidden xl:block"}`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Live A4 preview</div>
                <div className="text-xs text-muted-foreground">{Math.round(previewScale * 100)}% · fits width</div>
              </div>
              {/* The shell reserves the scaled height so the page never overlaps
                  what follows, and the transform stays off the exported node. */}
              <div ref={previewShellRef} className="rounded-xl border bg-[#dedbd3] p-3 sm:p-6">
                <div style={{ height: previewHeight, overflow: "hidden" }}>
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", width: "210mm" }}>
                <div ref={previewRef} className={pageClass}>
                  {layout === "proposal" && <><div className="kdoc-topbar" /><div className="kdoc-orange" /></>}
                  {layout === "letterhead" && <><div className="kdoc-letter-shape-one" /><div className="kdoc-letter-shape-two" /></>}
                  <header className="kdoc-header">
                    <div className="kdoc-brand">
                      {brand.logoDataUrl
                        ? <img src={brand.logoDataUrl} alt={`${brand.companyName} logo`} className="kdoc-logo" />
                        : <div className="kdoc-fallback-logo">K</div>}
                      <div><div className="kdoc-company">{brand.companyName}</div><div className="kdoc-registration">{brand.registrationNo}</div></div>
                    </div>
                    <div className="kdoc-contact"><div>{brand.phone}</div><div>{brand.email}</div><div>{brand.address}</div></div>
                  </header>
                  <main className="kdoc-body"><MarkdownPreview content={generatedContent} /></main>
                  <footer className="kdoc-footer"><span>{brand.phone}</span><span>{brand.email}</span><span>{brand.address}</span></footer>
                </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <style jsx global>{`
        ${exportCss}
        .doc-input { height: 2.75rem; width: 100%; border-radius: .7rem; border: 1px solid #ddd8cf; background: #fff; padding: 0 .85rem; font-size: .875rem; outline: none; }
        .doc-input:focus, .doc-textarea:focus { border-color: #ba5c42; box-shadow: 0 0 0 3px rgba(186,92,66,.10); }
        .doc-textarea { min-height: 7rem; width: 100%; resize: vertical; border-radius: .7rem; border: 1px solid #ddd8cf; background: #fff; padding: .8rem; font-size: .875rem; line-height: 1.55; outline: none; }
        .line-action { display: inline-flex; height: 2.5rem; width: 2.5rem; align-items: center; justify-content: center; border-radius: .5rem; color: #5d665f; }
        .line-action:hover:not(:disabled) { background: #efece4; color: #202c25; }
        .line-action:disabled { opacity: .3; }
        .line-action-danger:hover:not(:disabled) { background: #fee2e2; color: #dc2626; }
        .kdoc-page { box-shadow: 0 16px 50px rgba(0,0,0,.14); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <Label className="block"><span className="mb-2 block text-[#343a35]">{label}</span>{children}</Label>;
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-white/60">{label}</span><span className="font-medium">{value}</span></div>;
}
