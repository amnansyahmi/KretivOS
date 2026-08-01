"use client";

/**
 * The paper Kretivco sends to clients.
 *
 * Deliberately plain CSS rather than Tailwind utilities: this markup is also
 * serialised into a standalone document for the print window and for PDF
 * export, where no stylesheet is loaded. Everything it needs travels with it.
 *
 * Measurements follow the supplied templates — A4, 20mm side margins, Helvetica
 * at 10pt, a 1px ruled table, totals right-aligned in a fixed-width column and
 * a signature pair at the foot. The layout is fixed; the wording comes from
 * print_templates and is edited in Settings.
 */

import { useEffect, useRef, useState } from "react";
import type { PrintModel } from "@/lib/print-templates";
import { cn } from "@/lib/utils";

const A4_WIDTH_PX = 794;
const A4_MIN_HEIGHT_PX = 1123;

export const PRINT_STYLES = `
  @page { size: A4; margin: 18mm 20mm; }

  .ktpl {
    font-family: Helvetica, Arial, "Nimbus Sans", sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #000;
    background: #fff;
    max-width: 170mm;
    margin: 0 auto;
  }

  .ktpl-header { display: flex; align-items: flex-start; gap: 14mm; }
  .ktpl-logo { width: 26mm; height: auto; flex-shrink: 0; }
  .ktpl-company { flex: 1; min-width: 0; padding-top: 2mm; }
  .ktpl-company-name { font-size: 13pt; font-weight: bold; margin: 0 0 1mm; }
  .ktpl-company-line { margin: 0; }

  .ktpl-title-block { text-align: right; flex-shrink: 0; padding-top: 1mm; }
  .ktpl-heading { font-size: 20pt; font-weight: bold; margin: 0 0 3mm; letter-spacing: .01em; }
  .ktpl-meta { margin: 0; white-space: nowrap; }
  .ktpl-meta strong { font-weight: bold; }

  .ktpl-rule { border: 0; border-top: 1px solid #999; margin: 6mm 0 7mm; }

  .ktpl-party-label { font-weight: bold; margin: 0 0 1mm; }
  .ktpl-party-line { margin: 0; }
  .ktpl-job { margin: 5mm 0 5mm; }
  .ktpl-job strong { font-weight: bold; }

  .ktpl-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .ktpl-table th, .ktpl-table td {
    border: 1px solid #000;
    padding: 2mm 2.5mm;
    vertical-align: top;
    word-wrap: break-word;
  }
  .ktpl-table th { font-weight: bold; text-align: left; }
  .ktpl-table .k-center { text-align: center; }
  .ktpl-table .k-right { text-align: right; }

  .ktpl-totals { width: 100%; margin-top: 6mm; }
  .ktpl-totals table { margin-left: auto; border-collapse: collapse; }
  .ktpl-totals td { padding: 1mm 0; }
  .ktpl-totals .k-label { font-weight: bold; text-align: right; padding-right: 8mm; white-space: nowrap; }
  .ktpl-totals .k-value { text-align: right; min-width: 28mm; white-space: nowrap; }
  .ktpl-totals .k-strong { font-weight: bold; }

  .ktpl-notes { margin-top: 9mm; }
  .ktpl-notes-label { font-weight: bold; margin: 0 0 1mm; }
  .ktpl-note { margin: 0 0 1mm; }
  .ktpl-closing { margin: 1mm 0 0; }

  .ktpl-signatures { display: flex; gap: 18mm; margin-top: 11mm; }
  .ktpl-signature { flex: 1; }
  .ktpl-signature-label { font-weight: bold; margin: 0 0 14mm; }
  .ktpl-signature-line { border-top: 1px solid #000; width: 62mm; }

  @media print {
    .ktpl { max-width: none; }
    .ktpl-responsive-host,
    .ktpl-responsive-frame {
      width: auto !important;
      height: auto !important;
      max-width: none !important;
      overflow: visible !important;
      margin: 0 !important;
    }
    .ktpl-responsive-sheet {
      width: auto !important;
      min-height: 0 !important;
      padding: 0 !important;
      transform: none !important;
      box-shadow: none !important;
    }
    /* A long item list must not orphan the totals from the table above it. */
    .ktpl-table { page-break-inside: auto; }
    .ktpl-table tr { page-break-inside: avoid; }
    .ktpl-totals, .ktpl-signatures { page-break-inside: avoid; }
  }
`;

/**
 * Keeps the document at its real A4 layout, then scales the whole sheet to the
 * available screen width. Unlike CSS `zoom`, transforms behave consistently in
 * iOS Safari and leave the actual print layout untouched.
 */
export function ResponsivePrintDocument({
  model,
  className,
}: {
  model: PrintModel;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ scale: 1, height: A4_MIN_HEIGHT_PX });

  useEffect(() => {
    const measure = () => {
      const availableWidth = hostRef.current?.clientWidth ?? A4_WIDTH_PX;
      const scale = Math.min(1, availableWidth / A4_WIDTH_PX);
      const height = Math.max(A4_MIN_HEIGHT_PX, sheetRef.current?.scrollHeight ?? A4_MIN_HEIGHT_PX);

      setViewport((current) =>
        Math.abs(current.scale - scale) < 0.001 && current.height === height
          ? current
          : { scale, height },
      );
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (hostRef.current) observer?.observe(hostRef.current);
    if (sheetRef.current) observer?.observe(sheetRef.current);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [model]);

  return (
    <div ref={hostRef} className={cn("ktpl-responsive-host w-full", className)}>
      <div
        className="ktpl-responsive-frame mx-auto"
        style={{
          width: A4_WIDTH_PX * viewport.scale,
          height: viewport.height * viewport.scale,
        }}
      >
        <div
          ref={sheetRef}
          className="ktpl-responsive-sheet box-border bg-white px-[20mm] py-[18mm] shadow-soft"
          style={{
            width: A4_WIDTH_PX,
            minHeight: A4_MIN_HEIGHT_PX,
            transform: `scale(${viewport.scale})`,
            transformOrigin: "top left",
          }}
        >
          <PrintDocument model={model} />
        </div>
      </div>
    </div>
  );
}

export function PrintDocument({ model }: { model: PrintModel }) {
  const { company } = model;

  return (
    <div className="ktpl">
      <div className="ktpl-header">
        {company.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- must survive
          // serialisation into the standalone print document, where next/image
          // has no runtime.
          <img className="ktpl-logo" src={company.logoUrl} alt="" />
        )}

        <div className="ktpl-company">
          <p className="ktpl-company-name">{company.name}</p>
          {company.registrationNumber && <p className="ktpl-company-line">({company.registrationNumber})</p>}
          {company.addressLines.map((line, index) => (
            <p className="ktpl-company-line" key={index}>{line}</p>
          ))}
        </div>

        <div className="ktpl-title-block">
          <p className="ktpl-heading">{model.heading}</p>
          {model.meta.map((row) => (
            <p className="ktpl-meta" key={row.label}>
              <strong>{row.label}:</strong> {row.value}
            </p>
          ))}
        </div>
      </div>

      <hr className="ktpl-rule" />

      <p className="ktpl-party-label">Customer:</p>
      <p className="ktpl-party-line">{model.customerName}</p>
      {model.customerAddressLines.map((line, index) => (
        <p className="ktpl-party-line" key={index}>{line}</p>
      ))}

      {model.title && <p className="ktpl-job"><strong>Title:</strong> {model.title}</p>}

      <table className="ktpl-table">
        <colgroup>
          {model.columns.map((column) => (
            <col
              key={column.key}
              style={{ width: COLUMN_WIDTHS[column.key] ?? "auto" }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {model.columns.map((column) => (
              <th key={column.key} className={alignClass(column.align)}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={alignClass(model.columns[cellIndex]?.align ?? "left")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ktpl-totals">
        <table>
          <tbody>
            {model.totals.map((row) => (
              <tr key={row.label}>
                <td className="k-label">{row.label}</td>
                <td className={`k-value${row.bold ? " k-strong" : ""}`}>
                  {row.parenthesised ? `(${row.value})` : row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(model.notes.length > 0 || model.closingLine) && (
        <div className="ktpl-notes">
          {model.notes.length > 0 && <p className="ktpl-notes-label">Note:</p>}
          {model.notes.map((note, index) => (
            <p className="ktpl-note" key={index}>{index + 1}. {note}</p>
          ))}
          {model.closingLine && <p className="ktpl-closing">{model.closingLine}</p>}
        </div>
      )}

      {model.signatures && (
        <div className="ktpl-signatures">
          <div className="ktpl-signature">
            <p className="ktpl-signature-label">{model.signatures.issuedBy}</p>
            <div className="ktpl-signature-line" />
          </div>
          <div className="ktpl-signature">
            <p className="ktpl-signature-label">{model.signatures.acceptedBy}</p>
            <div className="ktpl-signature-line" />
          </div>
        </div>
      )}
    </div>
  );
}

const COLUMN_WIDTHS: Record<string, string> = {
  no: "9%",
  description: "auto",
  unit: "13%",
  price: "16%",
  amount: "18%",
  method: "28%",
};

const alignClass = (align: "left" | "center" | "right") =>
  align === "center" ? "k-center" : align === "right" ? "k-right" : "";

/**
 * Wraps rendered markup as a standalone document for the print window.
 *
 * The logo is referenced absolutely: a relative path resolves against
 * about:blank in the popup and the image silently fails to load, which is the
 * kind of thing nobody notices until a client receives a logo-less invoice.
 */
export function printableHtml(title: string, bodyHtml: string, origin: string) {
  const absolute = bodyHtml.replace(/src="\/(?!\/)/g, `src="${origin}/`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>html,body{margin:0;padding:0;background:#fff}${PRINT_STYLES}</style></head><body>${absolute}</body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] as string));
}
