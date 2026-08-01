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

import type { PrintModel } from "@/lib/print-templates";

export const PRINT_STYLES = `
  @page { size: A4; margin: 18mm 20mm; }

  .kdoc {
    font-family: Helvetica, Arial, "Nimbus Sans", sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #000;
    background: #fff;
    max-width: 170mm;
    margin: 0 auto;
  }

  .kdoc-header { display: flex; align-items: flex-start; gap: 14mm; }
  .kdoc-logo { width: 26mm; height: auto; flex-shrink: 0; }
  .kdoc-company { flex: 1; min-width: 0; padding-top: 2mm; }
  .kdoc-company-name { font-size: 13pt; font-weight: bold; margin: 0 0 1mm; }
  .kdoc-company-line { margin: 0; }

  .kdoc-title-block { text-align: right; flex-shrink: 0; padding-top: 1mm; }
  .kdoc-heading { font-size: 20pt; font-weight: bold; margin: 0 0 3mm; letter-spacing: .01em; }
  .kdoc-meta { margin: 0; white-space: nowrap; }
  .kdoc-meta strong { font-weight: bold; }

  .kdoc-rule { border: 0; border-top: 1px solid #999; margin: 6mm 0 7mm; }

  .kdoc-party-label { font-weight: bold; margin: 0 0 1mm; }
  .kdoc-party-line { margin: 0; }
  .kdoc-job { margin: 5mm 0 5mm; }
  .kdoc-job strong { font-weight: bold; }

  .kdoc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .kdoc-table th, .kdoc-table td {
    border: 1px solid #000;
    padding: 2mm 2.5mm;
    vertical-align: top;
    word-wrap: break-word;
  }
  .kdoc-table th { font-weight: bold; text-align: left; }
  .kdoc-table .k-center { text-align: center; }
  .kdoc-table .k-right { text-align: right; }

  .kdoc-totals { width: 100%; margin-top: 6mm; }
  .kdoc-totals table { margin-left: auto; border-collapse: collapse; }
  .kdoc-totals td { padding: 1mm 0; }
  .kdoc-totals .k-label { font-weight: bold; text-align: right; padding-right: 8mm; white-space: nowrap; }
  .kdoc-totals .k-value { text-align: right; min-width: 28mm; white-space: nowrap; }
  .kdoc-totals .k-strong { font-weight: bold; }

  .kdoc-notes { margin-top: 9mm; }
  .kdoc-notes-label { font-weight: bold; margin: 0 0 1mm; }
  .kdoc-note { margin: 0 0 1mm; }
  .kdoc-closing { margin: 1mm 0 0; }

  .kdoc-signatures { display: flex; gap: 18mm; margin-top: 11mm; }
  .kdoc-signature { flex: 1; }
  .kdoc-signature-label { font-weight: bold; margin: 0 0 14mm; }
  .kdoc-signature-line { border-top: 1px solid #000; width: 62mm; }

  @media print {
    .kdoc { max-width: none; }
    /* A long item list must not orphan the totals from the table above it. */
    .kdoc-table { page-break-inside: auto; }
    .kdoc-table tr { page-break-inside: avoid; }
    .kdoc-totals, .kdoc-signatures { page-break-inside: avoid; }
  }
`;

export function PrintDocument({ model }: { model: PrintModel }) {
  const { company } = model;

  return (
    <div className="kdoc">
      <div className="kdoc-header">
        {company.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- must survive
          // serialisation into the standalone print document, where next/image
          // has no runtime.
          <img className="kdoc-logo" src={company.logoUrl} alt="" />
        )}

        <div className="kdoc-company">
          <p className="kdoc-company-name">{company.name}</p>
          {company.registrationNumber && <p className="kdoc-company-line">({company.registrationNumber})</p>}
          {company.addressLines.map((line, index) => (
            <p className="kdoc-company-line" key={index}>{line}</p>
          ))}
        </div>

        <div className="kdoc-title-block">
          <p className="kdoc-heading">{model.heading}</p>
          {model.meta.map((row) => (
            <p className="kdoc-meta" key={row.label}>
              <strong>{row.label}:</strong> {row.value}
            </p>
          ))}
        </div>
      </div>

      <hr className="kdoc-rule" />

      <p className="kdoc-party-label">Customer:</p>
      <p className="kdoc-party-line">{model.customerName}</p>
      {model.customerAddressLines.map((line, index) => (
        <p className="kdoc-party-line" key={index}>{line}</p>
      ))}

      {model.title && <p className="kdoc-job"><strong>Title:</strong> {model.title}</p>}

      <table className="kdoc-table">
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

      <div className="kdoc-totals">
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
        <div className="kdoc-notes">
          {model.notes.length > 0 && <p className="kdoc-notes-label">Note:</p>}
          {model.notes.map((note, index) => (
            <p className="kdoc-note" key={index}>{index + 1}. {note}</p>
          ))}
          {model.closingLine && <p className="kdoc-closing">{model.closingLine}</p>}
        </div>
      )}

      {model.signatures && (
        <div className="kdoc-signatures">
          <div className="kdoc-signature">
            <p className="kdoc-signature-label">{model.signatures.issuedBy}</p>
            <div className="kdoc-signature-line" />
          </div>
          <div className="kdoc-signature">
            <p className="kdoc-signature-label">{model.signatures.acceptedBy}</p>
            <div className="kdoc-signature-line" />
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
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_STYLES}</style></head><body>${absolute}</body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] as string));
}
