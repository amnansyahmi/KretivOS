import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { extractDocument } from "@/lib/ocr";
import { extractMedicalCertificate, suggestLeaveFromCertificate } from "@/lib/medical-certificate";
import { claimableAmount, extractMedicalReceipt } from "@/lib/medical-receipt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/*
 * The character ceiling is derived rather than typed, so the two limits cannot
 * drift apart. base64 costs a third more than the bytes it carries, plus a
 * little for the `data:...;base64,` prefix.
 */
const MAX_DATA_URL_CHARACTERS = Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 200;
const ALLOWED_PURPOSES = new Set(["claim_receipt", "leave_attachment", "hr_document"]);
const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

function parseFile(value: unknown) {
  const dataUrl = clean(value);
  if (!dataUrl) throw new Error("File is missing.");
  if (dataUrl.length > MAX_DATA_URL_CHARACTERS) throw new Error("File exceeds the 5 MB limit.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("File must be a PDF, JPG, PNG or WebP.");
  const size = Math.floor(match[2].length * 0.75);
  if (size > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 5 MB limit.");
  return { dataUrl, mimeType: match[1], size };
}

/**
 * Read a claim receipt so the amount and date do not have to be keyed twice.
 *
 * Purchasing has had extraction since captures shipped while staff submitting
 * a claim typed everything by hand off the same kind of photograph. This runs
 * the same extractor, but the file is already stored by the time it is called
 * and a failure returns null rather than throwing: a receipt that cannot be
 * read is still a receipt on file, and the form stays keyable.
 *
 * Suggestions only — nothing is written from this, and the reviewer still sees
 * whatever the claimant finally submitted.
 */
async function readClaimReceipt(dataUrl: string) {
  try {
    const extraction = await extractDocument({ imageDataUrl: dataUrl, kind: "receipt" });
    if (!extraction.ok) return null;
    return {
      total: extraction.total,
      documentDate: extraction.documentDate,
      vendorName: extraction.vendorName,
      confidence: extraction.confidence,
      warnings: extraction.warnings,
    };
  } catch {
    return null;
  }
}

/**
 * Read a medical certificate so the sick leave dates do not have to be keyed.
 *
 * A receipt has been read on upload since claims shipped; a certificate was
 * stored and never opened, so somebody attaching an MC still typed the dates
 * off it by hand — and nothing ever compared the two. The dates come back as
 * suggestions the employee confirms, and `coverage` is the part that matters to
 * an approver: whether the certificate actually spans the days being asked for.
 *
 * Same contract as the receipt reader: suggestions only, nothing written, and a
 * failure returns null rather than throwing.
 */
async function readMedicalCertificate(dataUrl: string) {
  try {
    const certificate = await extractMedicalCertificate({ imageDataUrl: dataUrl });
    if (!certificate.ok) return null;
    return {
      kind: "medical_certificate",
      ok: true,
      // What was read, which the coverage check needs whether or not it was
      // read well enough to prefill the form.
      startDate: certificate.startDate ?? "",
      endDate: certificate.endDate ?? "",
      // Whether it was read well enough to put in the form unasked. A
      // half-read date dropped into a field is worse than an empty one,
      // because an empty field gets filled in and a wrong one gets submitted.
      prefill: Boolean(suggestLeaveFromCertificate(certificate)),
      clinicName: certificate.clinicName,
      practitioner: certificate.practitioner,
      certificateNumber: certificate.certificateNumber,
      patientName: certificate.patientName,
      days: certificate.rangeDays,
      confidence: certificate.confidence,
      warnings: certificate.warnings,
    };
  } catch {
    return null;
  }
}

/**
 * Read a clinic receipt for a medical claim.
 *
 * The retail extractor is told the total is the last and largest amount, which
 * is true of a till slip and wrong here: a clinic receipt stacks a bill total,
 * a previous payment, a current payment and a balance, so the last figure is
 * usually a zero balance. What is claimable is the payment made — see
 * `lib/medical-receipt.ts` for why that distinction is the whole point.
 *
 * The patient's NRIC is read by the extractor and deliberately not passed on.
 */
async function readMedicalClaimReceipt(dataUrl: string) {
  try {
    const receipt = await extractMedicalReceipt({ imageDataUrl: dataUrl });
    if (!receipt.ok) return null;
    const claim = claimableAmount(receipt);
    return {
      kind: "medical_receipt",
      ok: true,
      total: claim.amount,
      amountBasis: claim.basis,
      amountNote: claim.note,
      documentDate: receipt.documentDate,
      vendorName: receipt.clinicName,
      patientName: receipt.patientName,
      patientConfidence: receipt.confidence.patientName ?? 0,
      treatment: receipt.treatment,
      billTotal: receipt.billTotal,
      balance: receipt.balance,
      reference: receipt.receiptNumber || receipt.billNumber,
      confidence: receipt.confidence,
      warnings: receipt.warnings,
    };
  } catch {
    return null;
  }
}

/**
 * Whichever reader the document calls for, or none.
 *
 * A medical claim is routed by the category the claimant picked rather than by
 * sniffing the image: the category is already a deliberate statement about what
 * the document is, and guessing wrong would silently read a restaurant bill
 * with a prompt looking for a patient.
 */
async function readUpload(purpose: string, category: string, dataUrl: string) {
  if (purpose === "leave_attachment") return readMedicalCertificate(dataUrl);
  if (purpose !== "claim_receipt") return null;
  return category.toLowerCase() === "medical" ? readMedicalClaimReceipt(dataUrl) : readClaimReceipt(dataUrl);
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireHRSession();
    const body = object(await request.json());
    const purpose = clean(body.purpose);
    if (!ALLOWED_PURPOSES.has(purpose)) throw new Error("Unsupported HR file purpose.");
    if (purpose === "hr_document" && session.role !== "hr_admin") throw new HRAuthError("Only HR Admin can upload HR documents.", 403);
    const file = parseFile(body.dataUrl);
    const id = randomUUID();
    const filename = clean(body.filename).slice(0, 180) || `HR file ${id}`;
    const requestedEmployeeId = clean(body.employeeId);
    const companyWide = purpose === "hr_document" && !requestedEmployeeId;
    const employeeId = session.role === "employee" ? session.userId : requestedEmployeeId || session.userId;
    const sql = getDatabase();
    await sql`
      insert into assets (id, organization_id, name, asset_type, category, storage_url, mime_type, file_size, metadata)
      values (${id}, ${ORGANIZATION_ID}, ${filename}, 'hr_secure_file', ${purpose}, ${file.dataUrl}, ${file.mimeType}, ${file.size},
        ${JSON.stringify({ purpose, employeeId, audience: companyWide ? "company" : "employee", uploadedBy: session.userId, uploadedAt: new Date().toISOString(), private: true })}::jsonb)
    `;
    await sql`
      insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, after_data, metadata)
      values (${ORGANIZATION_ID}, ${session.userId}, 'hr.file.uploaded', 'hr_secure_file', ${id},
        ${JSON.stringify({ filename, purpose, employeeId, mimeType: file.mimeType, fileSize: file.size })}::jsonb,
        ${JSON.stringify({ source: "hr-files-api", authenticated: true, private: true })}::jsonb)
    `;
    return NextResponse.json({
      id, filename, purpose, mimeType: file.mimeType, fileSize: file.size,
      url: `/api/hr/files/${id}`,
      suggested: await readUpload(purpose, clean(body.category), file.dataUrl),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload HR file.";
    return NextResponse.json({ error: message }, { status: error instanceof HRAuthError ? error.status : 400 });
  }
}
