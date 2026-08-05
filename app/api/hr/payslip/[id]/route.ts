/**
 * One payslip, assembled for printing.
 *
 * Kept off `/api/print` deliberately. That route serves sales documents, which
 * are meant to leave the building; a payslip carries somebody's salary, NRIC
 * and tax number and must never be readable by whoever holds a link. This one
 * is behind the HR session, and an ordinary employee can only ask for their
 * own.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { HRAuthError, requireHRSession } from "@/lib/hr-auth";
import { payslipPrintModel } from "@/lib/payslip-print";
import { toCompany } from "@/lib/print-templates";
import { neonWorkspaceStore } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATION_ID = "org-kretivco";
const SCOPE = "hr-operations-v1";

const clean = (value: unknown) => String(value ?? "").trim();
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];

const operationsStore = neonWorkspaceStore<Record<string, any>>(SCOPE);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireHRSession();
    const { id } = await params;

    const snapshot = await operationsStore.load();
    const record = array(object(snapshot?.data).payroll).find((item: any) => clean(item.id) === clean(id));
    if (!record) throw new HRAuthError("Payslip was not found.", 404);

    // Payroll is HR Admin and Finance territory; everybody else gets their own
    // and nothing else. Checked here rather than trusted from the caller,
    // because a payslip URL is exactly the thing somebody tries editing.
    const own = clean(record.employeeId) === session.userId;
    if (!own && !["hr_admin", "finance"].includes(session.role)) {
      throw new HRAuthError("You can only open your own payslip.", 403);
    }

    const sql = getDatabase();
    const [employees, organizations] = await Promise.all([
      sql`select * from users where id = ${clean(record.employeeId)} and organization_id = ${ORGANIZATION_ID} limit 1`,
      sql`select * from organizations where id = ${ORGANIZATION_ID} limit 1`,
    ]);
    if (!employees.length) throw new HRAuthError("The employee for this payslip was not found.", 404);

    const metadata = object(employees[0].metadata);
    const model = payslipPrintModel({
      record,
      employee: {
        name: employees[0].display_name,
        employeeNumber: clean(metadata.employeeNumber),
        title: clean(metadata.title),
        department: clean(metadata.department),
        identificationNumber: clean(metadata.identificationNumber),
        epfNumber: clean(metadata.epfNumber),
        socsoNumber: clean(metadata.socsoNumber),
        incomeTaxNumber: clean(metadata.incomeTaxNumber),
        bankName: clean(metadata.bankName),
        bankAccountNumber: clean(metadata.bankAccountNumber),
      },
      company: toCompany(organizations[0]),
      issuedBy: session.name,
    });

    /*
     * A draft is a working figure that can still change. Printing one produces
     * a document an employee will keep and compare against what they are
     * actually paid, so it is warned about rather than blocked — there are
     * legitimate reasons to preview one before closing the period.
     */
    const warning = ["Closed", "Paid"].includes(clean(record.status))
      ? null
      : "This payroll period is still a draft, so these figures can change before it is closed.";

    return NextResponse.json({ model, warning }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof HRAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the payslip." }, { status });
  }
}
