/**
 * Structured line items for commercial documents (quotation, invoice, sales order).
 *
 * Documents store these rows alongside the flat template variables so a saved
 * quotation can be reopened and edited as a table rather than as free text. The
 * rendered markdown table and the computed totals are written back into the
 * ordinary `{{line_items}}`, `{{subtotal}}`, `{{tax}}` and `{{total}}` variables,
 * so existing templates keep working without being rewritten.
 */

export type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type LineItemSettings = {
  currency: string;
  taxLabel: string;
  taxRate: number;
  discountPercent: number;
};

export type LineItemTotals = {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
};

export type LineItemState = {
  items: LineItem[];
  settings: LineItemSettings;
};

/** Reserved variable key. Templates never reference it, so it renders nothing. */
export const LINE_ITEMS_STATE_KEY = "_line_items";

/** A template opts into the structured editor by using this variable. */
export const LINE_ITEMS_VARIABLE = "line_items";

/** Variables computed from the rows. They become read-only in the composer. */
export const COMPUTED_VARIABLES = ["subtotal", "tax", "total", "amount_due", "discount"];

export const defaultSettings: LineItemSettings = {
  currency: "RM",
  taxLabel: "SST",
  taxRate: 0,
  discountPercent: 0,
};

export function lineItemId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyLineItem(): LineItem {
  return { id: lineItemId(), description: "", quantity: 1, unit: "", unitPrice: 0 };
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function lineAmount(item: LineItem) {
  return round2(Number(item.quantity || 0) * Number(item.unitPrice || 0));
}

export function computeTotals(items: LineItem[], settings: LineItemSettings): LineItemTotals {
  const subtotal = round2(items.reduce((sum, item) => sum + lineAmount(item), 0));
  const discountAmount = round2(subtotal * (Number(settings.discountPercent) || 0) / 100);
  const taxableAmount = round2(subtotal - discountAmount);
  const taxAmount = round2(taxableAmount * (Number(settings.taxRate) || 0) / 100);
  return { subtotal, discountAmount, taxableAmount, taxAmount, total: round2(taxableAmount + taxAmount) };
}

export function formatMoney(currency: string, value: number) {
  const amount = Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency}${amount}`;
}

/** Escapes pipes so a description can never break the generated table. */
function cell(value: string) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

export function lineItemsMarkdown(items: LineItem[], settings: LineItemSettings) {
  const rows = items.filter((item) => item.description.trim() || lineAmount(item));
  if (!rows.length) return "_No items added yet._";

  const header = "| # | Description | Qty / Unit | Unit price | Amount |\n| --- | --- | ---: | ---: | ---: |";
  const body = rows
    .map((item, index) => {
      const qty = item.unit.trim() ? `${item.quantity} ${cell(item.unit)}` : String(item.quantity);
      return `| ${index + 1} | ${cell(item.description) || "—"} | ${qty} | ${formatMoney(settings.currency, item.unitPrice)} | ${formatMoney(settings.currency, lineAmount(item))} |`;
    })
    .join("\n");

  return `${header}\n${body}`;
}

/**
 * Produces the flat template variables for a set of rows. Only keys the template
 * actually uses are meaningful; the rest are harmlessly ignored at render time.
 */
export function lineItemValues(state: LineItemState): Record<string, string> {
  const { items, settings } = state;
  const totals = computeTotals(items, settings);
  const taxLabel = settings.taxRate ? `${settings.taxLabel} ${settings.taxRate}%` : settings.taxLabel;

  return {
    [LINE_ITEMS_VARIABLE]: lineItemsMarkdown(items, settings),
    subtotal: formatMoney(settings.currency, totals.subtotal),
    discount: totals.discountAmount ? `−${formatMoney(settings.currency, totals.discountAmount)} (${settings.discountPercent}%)` : formatMoney(settings.currency, 0),
    tax: `${formatMoney(settings.currency, totals.taxAmount)}${settings.taxRate ? ` · ${taxLabel}` : ""}`,
    total: formatMoney(settings.currency, totals.total),
    amount_due: formatMoney(settings.currency, totals.total),
  };
}

export function serialiseLineItems(state: LineItemState) {
  return JSON.stringify(state);
}

/** Restores rows saved on a document, tolerating older documents that have none. */
export function parseLineItems(raw: unknown): LineItemState | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items.map((item: any) => ({
        id: String(item?.id || lineItemId()),
        description: String(item?.description ?? ""),
        quantity: Number(item?.quantity) || 0,
        unit: String(item?.unit ?? ""),
        unitPrice: Number(item?.unitPrice) || 0,
      })),
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
    };
  } catch {
    return null;
  }
}

export function templateUsesLineItems(content: string) {
  return new RegExp(`{{\\s*${LINE_ITEMS_VARIABLE}\\s*}}`).test(content);
}
