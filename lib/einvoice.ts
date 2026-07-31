/**
 * LHDN MyInvois e-Invoice client.
 *
 * Malaysia's e-Invoice mandate requires sales documents to be submitted to LHDN
 * and validated before they are legally complete. A validated document comes
 * back with a UUID and a long id, which together form the QR code that must
 * appear on the copy given to the buyer.
 *
 * IMPORTANT — this has never been executed against MyInvois. It is written to
 * the published API shape but could not be exercised: submitting requires an
 * LHDN client id and secret issued against a registered TIN, and the sandbox is
 * not reachable without them. Before going live, verify against the current
 * MyInvois SDK documentation:
 *
 *   - the classification and tax-type code lists, which LHDN revises
 *   - required address and identity fields for your taxpayer profile
 *   - whether your submissions need the `onbehalfof` intermediary header
 *
 * Every call returns a typed result rather than throwing, so a submission
 * failure leaves the invoice untouched and retryable instead of half-recorded.
 */

import { createHash } from "node:crypto";

const SANDBOX_ORIGIN = "https://preprod-api.myinvois.hasil.gov.my";
const PRODUCTION_ORIGIN = "https://api.myinvois.hasil.gov.my";

/** LHDN allows a validated document to be cancelled only inside this window. */
export const CANCELLATION_WINDOW_HOURS = 72;

export type EInvoiceEnvironment = "sandbox" | "production";

export type EInvoiceConfig = {
  environment: EInvoiceEnvironment;
  clientId: string;
  clientSecret: string;
  /** The submitting taxpayer's TIN. */
  supplierTin: string;
  /** Business registration number, as registered with LHDN. */
  supplierBrn: string;
  /** Set when submitting on behalf of another taxpayer. */
  onBehalfOf?: string;
};

export type EInvoiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retryable: boolean; details?: unknown };

export function eInvoiceConfig(): EInvoiceConfig | null {
  const clientId = process.env.MYINVOIS_CLIENT_ID?.trim();
  const clientSecret = process.env.MYINVOIS_CLIENT_SECRET?.trim();
  const supplierTin = process.env.MYINVOIS_SUPPLIER_TIN?.trim();
  if (!clientId || !clientSecret || !supplierTin) return null;

  return {
    environment: process.env.MYINVOIS_ENVIRONMENT === "production" ? "production" : "sandbox",
    clientId,
    clientSecret,
    supplierTin,
    supplierBrn: process.env.MYINVOIS_SUPPLIER_BRN?.trim() || "",
    onBehalfOf: process.env.MYINVOIS_ON_BEHALF_OF?.trim() || undefined,
  };
}

const originFor = (environment: EInvoiceEnvironment) =>
  environment === "production" ? PRODUCTION_ORIGIN : SANDBOX_ORIGIN;

/**
 * Access tokens are cached until shortly before they expire.
 *
 * LHDN rate-limits the token endpoint, and a submission run that fetched a
 * fresh token per invoice would hit that limit on a normal month-end batch.
 */
let cachedToken: { token: string; expiresAt: number; key: string } | null = null;

async function accessToken(config: EInvoiceConfig): Promise<EInvoiceResult<string>> {
  const key = `${config.environment}:${config.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) {
    return { ok: true, data: cachedToken.token };
  }

  try {
    const response = await fetch(`${originFor(config.environment)}/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "InvoicingAPI",
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) {
      return {
        ok: false,
        // 401 here means bad credentials, which retrying will not fix.
        retryable: response.status >= 500,
        error: `MyInvois authentication failed (${response.status}).`,
        details: payload,
      };
    }

    cachedToken = {
      key,
      token: String(payload.access_token),
      expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
    };
    return { ok: true, data: cachedToken.token };
  } catch (error) {
    return { ok: false, retryable: true, error: error instanceof Error ? error.message : "MyInvois is unreachable." };
  }
}

async function call<T>(config: EInvoiceConfig, path: string, init: RequestInit): Promise<EInvoiceResult<T>> {
  const token = await accessToken(config);
  if (!token.ok) return token;

  try {
    const response = await fetch(`${originFor(config.environment)}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token.data}`,
        ...(config.onBehalfOf ? { onbehalfof: config.onBehalfOf } : {}),
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        // 429 and 5xx are worth retrying; a 4xx validation failure is not.
        retryable: response.status === 429 || response.status >= 500,
        error: `MyInvois ${path} failed (${response.status}).`,
        details: payload,
      };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    return { ok: false, retryable: true, error: error instanceof Error ? error.message : "MyInvois request failed." };
  }
}

// ---------------------------------------------------------------------------
// UBL 2.1 document
// ---------------------------------------------------------------------------

export type EInvoiceParty = {
  name: string;
  tin: string;
  registrationNumber: string;
  sstNumber?: string;
  /** NRIC/passport/army number, used when a buyer has no TIN. */
  identityType?: string;
  identityNumber?: string;
  email?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateCode: string;
  postcode: string;
  countryCode: string;
  msicCode?: string;
  businessActivity?: string;
};

export type EInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  taxRate: number;
  /** LHDN classification code; "022" is the general catch-all. */
  classificationCode: string;
};

export type EInvoiceDocument = {
  internalId: string;
  issueDate: string;
  issueTime?: string;
  currency: string;
  exchangeRate?: number;
  documentType: string;
  supplier: EInvoiceParty;
  buyer: EInvoiceParty;
  lines: EInvoiceLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
};

const money = (value: number, currency: string) => [{ _: Number(value.toFixed(2)), currencyID: currency }];
const plain = (value: unknown) => [{ _: String(value ?? "") }];

function partyBlock(party: EInvoiceParty) {
  return [{
    PartyIdentification: [
      { ID: [{ _: party.tin || "EI00000000010", schemeID: "TIN" }] },
      { ID: [{ _: party.registrationNumber || "NA", schemeID: "BRN" }] },
      ...(party.sstNumber ? [{ ID: [{ _: party.sstNumber, schemeID: "SST" }] }] : []),
      ...(party.identityNumber ? [{ ID: [{ _: party.identityNumber, schemeID: party.identityType || "NRIC" }] }] : []),
    ],
    PostalAddress: [{
      CityName: plain(party.city),
      PostalZone: plain(party.postcode),
      CountrySubentityCode: plain(party.stateCode),
      AddressLine: [
        { Line: plain(party.addressLine1) },
        ...(party.addressLine2 ? [{ Line: plain(party.addressLine2) }] : []),
      ],
      Country: [{
        IdentificationCode: [{ _: party.countryCode || "MYS", listID: "ISO3166-1", listAgencyID: "6" }],
      }],
    }],
    PartyLegalEntity: [{ RegistrationName: plain(party.name) }],
    Contact: [{
      Telephone: plain(party.phone || "NA"),
      ElectronicMail: plain(party.email || "NA"),
    }],
    ...(party.msicCode ? {
      IndustryClassificationCode: [{ _: party.msicCode, name: party.businessActivity || "" }],
    } : {}),
  }];
}

/**
 * Builds the UBL 2.1 Invoice payload.
 *
 * UBL's JSON binding wraps nearly every scalar in an array of objects with an
 * `_` value; that shape is required, not stylistic. Field names and code lists
 * must be checked against the current SDK before production use.
 */
export function buildUblInvoice(document: EInvoiceDocument) {
  const currency = document.currency || "MYR";
  const taxable = Number((document.subtotal).toFixed(2));

  return {
    _D: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    _A: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    _B: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    Invoice: [{
      ID: plain(document.internalId),
      IssueDate: plain(document.issueDate),
      IssueTime: plain(document.issueTime || "00:00:00Z"),
      InvoiceTypeCode: [{ _: document.documentType, listVersionID: "1.1" }],
      DocumentCurrencyCode: plain(currency),
      ...(document.exchangeRate && document.exchangeRate !== 1
        ? { TaxExchangeRate: [{ SourceCurrencyCode: plain(currency), TargetCurrencyCode: plain("MYR"), CalculationRate: [{ _: document.exchangeRate }] }] }
        : {}),

      AccountingSupplierParty: [{ Party: partyBlock(document.supplier) }],
      AccountingCustomerParty: [{ Party: partyBlock(document.buyer) }],

      TaxTotal: [{
        TaxAmount: money(document.taxAmount, currency),
        TaxSubtotal: [{
          TaxableAmount: money(taxable, currency),
          TaxAmount: money(document.taxAmount, currency),
          TaxCategory: [{
            // "01" is service tax; "06" is not applicable. Verify against the
            // current LHDN tax-type list before relying on this default.
            ID: plain(document.taxAmount > 0 ? "01" : "06"),
            TaxScheme: [{ ID: [{ _: "OTH", schemeID: "UN/ECE 5153", schemeAgencyID: "6" }] }],
          }],
        }],
      }],

      LegalMonetaryTotal: [{
        LineExtensionAmount: money(taxable, currency),
        TaxExclusiveAmount: money(taxable, currency),
        TaxInclusiveAmount: money(document.total, currency),
        PayableAmount: money(document.total, currency),
      }],

      InvoiceLine: document.lines.map((line, index) => ({
        ID: plain(String(index + 1)),
        InvoicedQuantity: [{ _: line.quantity, unitCode: "C62" }],
        LineExtensionAmount: money(line.amount, currency),
        TaxTotal: [{
          TaxAmount: money(line.taxAmount, currency),
          TaxSubtotal: [{
            TaxableAmount: money(line.amount, currency),
            TaxAmount: money(line.taxAmount, currency),
            Percent: [{ _: line.taxRate }],
            TaxCategory: [{
              ID: plain(line.taxAmount > 0 ? "01" : "06"),
              TaxScheme: [{ ID: [{ _: "OTH", schemeID: "UN/ECE 5153", schemeAgencyID: "6" }] }],
            }],
          }],
        }],
        Item: [{
          Description: plain(line.description),
          CommodityClassification: [{
            ItemClassificationCode: [{ _: line.classificationCode || "022", listID: "CLASS" }],
          }],
        }],
        Price: [{ PriceAmount: money(line.unitPrice, currency) }],
        ItemPriceExtension: [{ Amount: money(line.amount, currency) }],
      })),
    }],
  };
}

/** LHDN requires the SHA-256 of the exact bytes submitted, as lowercase hex. */
export function documentHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// API operations
// ---------------------------------------------------------------------------

export type SubmissionAccepted = {
  submissionUid: string;
  acceptedDocuments: { uuid: string; invoiceCodeNumber: string }[];
  rejectedDocuments: { invoiceCodeNumber: string; error: unknown }[];
};

export async function submitInvoice(config: EInvoiceConfig, document: EInvoiceDocument): Promise<EInvoiceResult<SubmissionAccepted & { payload: unknown; hash: string }>> {
  const payload = buildUblInvoice(document);
  const json = JSON.stringify(payload);
  const hash = documentHash(payload);

  const result = await call<any>(config, "/api/v1.0/documentsubmissions", {
    method: "POST",
    body: JSON.stringify({
      documents: [{
        format: "JSON",
        document: Buffer.from(json, "utf8").toString("base64"),
        documentHash: hash,
        codeNumber: document.internalId,
      }],
    }),
  });

  if (!result.ok) return result;

  const accepted = Array.isArray(result.data?.acceptedDocuments) ? result.data.acceptedDocuments : [];
  const rejected = Array.isArray(result.data?.rejectedDocuments) ? result.data.rejectedDocuments : [];

  if (!accepted.length) {
    return {
      ok: false,
      // Rejection here is a validation failure in the document itself; resending
      // the same payload would fail identically.
      retryable: false,
      error: "MyInvois rejected the document at submission.",
      details: rejected,
    };
  }

  return {
    ok: true,
    data: {
      submissionUid: String(result.data.submissionUid || ""),
      acceptedDocuments: accepted,
      rejectedDocuments: rejected,
      payload,
      hash,
    },
  };
}

export type DocumentStatus = {
  uuid: string;
  status: "Submitted" | "Valid" | "Invalid" | "Cancelled";
  longId: string;
  validationErrors: unknown[];
  dateTimeValidated: string;
};

/**
 * Validation is asynchronous: submission only means LHDN accepted the document
 * for processing, so the real status has to be polled.
 */
export async function documentStatus(config: EInvoiceConfig, uuid: string): Promise<EInvoiceResult<DocumentStatus>> {
  const result = await call<any>(config, `/api/v1.0/documents/${encodeURIComponent(uuid)}/details`, { method: "GET" });
  if (!result.ok) return result;

  const raw = String(result.data?.status || "").toLowerCase();
  const status: DocumentStatus["status"] =
    raw === "valid" ? "Valid" : raw === "invalid" ? "Invalid" : raw === "cancelled" ? "Cancelled" : "Submitted";

  return {
    ok: true,
    data: {
      uuid: String(result.data?.uuid || uuid),
      status,
      longId: String(result.data?.longId || ""),
      validationErrors: Array.isArray(result.data?.validationResults?.validationSteps)
        ? result.data.validationResults.validationSteps.filter((step: any) => String(step?.status).toLowerCase() === "invalid")
        : [],
      dateTimeValidated: String(result.data?.dateTimeValidated || ""),
    },
  };
}

export async function cancelDocument(config: EInvoiceConfig, uuid: string, reason: string): Promise<EInvoiceResult<{ uuid: string; status: string }>> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, retryable: false, error: "LHDN requires a cancellation reason." };

  const result = await call<any>(config, `/api/v1.0/documents/state/${encodeURIComponent(uuid)}/state`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled", reason: trimmed.slice(0, 300) }),
  });
  if (!result.ok) return result;
  return { ok: true, data: { uuid, status: String(result.data?.status || "cancelled") } };
}

/** The public QR target printed on the buyer's copy. */
export function validationUrl(environment: EInvoiceEnvironment, uuid: string, longId: string) {
  const origin = environment === "production" ? "https://myinvois.hasil.gov.my" : "https://preprod.myinvois.hasil.gov.my";
  return `${origin}/${encodeURIComponent(uuid)}/share/${encodeURIComponent(longId)}`;
}

/** Whether a validated document is still inside its cancellation window. */
export function cancellableUntil(validatedAt: string | Date) {
  const validated = new Date(validatedAt);
  if (Number.isNaN(validated.getTime())) return null;
  return new Date(validated.getTime() + CANCELLATION_WINDOW_HOURS * 3600_000);
}
