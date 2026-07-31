import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HRMSAttendanceReview } from "@/components/hrms-attendance-review";
import { getHRSession, publicSession } from "@/lib/hr-auth";

export const metadata: Metadata = {
  title: "Attendance Review · HRMS",
  description: "Review Kretivco attendance evidence and timestamp verification",
};
export const dynamic = "force-dynamic";

export default async function AttendanceReviewPage() {
  const session = await getHRSession();
  if (!session) redirect("/hr/login");
  if (!['hr_admin', 'manager'].includes(session.role)) redirect("/hr?section=attendance");
  return <HRMSAttendanceReview session={publicSession(session)} />;
}
