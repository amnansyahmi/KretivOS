"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Download, FileText, ImagePlus, Printer, Save, Settings2, Trash2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownPreview } from "@/components/markdown-preview";

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
  const [layout, setLayout] = useState<DocumentLayout>(() => initialLayout(template.category));
  const [brand, setBrand] = useState<DocumentBrandProfile>(defaultBrand);
  const [notice, setNotice] = useState("");

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

          <div className="grid gap-5 xl:grid-cols-[410px_minmax(0,1fr)]">
            <div className="space-y-4">
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

              <div className="rounded-xl border bg-white p-4">
                <div className="mb-4 text-sm font-semibold">Document content</div>
                <div className="space-y-4">
                  {variables.map((variable) => {
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

            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold">Live A4 preview</div><div className="text-xs text-muted-foreground">Content and logo update instantly</div></div>
              <div className="overflow-x-auto rounded-xl border bg-[#dedbd3] p-3 sm:p-6">
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
        </CardContent>
      </Card>

      <style jsx global>{`
        ${exportCss}
        .doc-input { height: 2.75rem; width: 100%; border-radius: .7rem; border: 1px solid #ddd8cf; background: #fff; padding: 0 .85rem; font-size: .875rem; outline: none; }
        .doc-input:focus, .doc-textarea:focus { border-color: #ba5c42; box-shadow: 0 0 0 3px rgba(186,92,66,.10); }
        .doc-textarea { min-height: 7rem; width: 100%; resize: vertical; border-radius: .7rem; border: 1px solid #ddd8cf; background: #fff; padding: .8rem; font-size: .875rem; line-height: 1.55; outline: none; }
        .kdoc-page { transform-origin: top left; box-shadow: 0 16px 50px rgba(0,0,0,.14); }
        @media (max-width: 900px) { .kdoc-page { width: 210mm; transform: scale(.68); margin-bottom: -95mm; } }
        @media (max-width: 620px) { .kdoc-page { transform: scale(.47); margin-bottom: -158mm; } }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-[#343a35]">{label}</span>{children}</label>;
}
