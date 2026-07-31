import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HRMSWorkspace } from "@/components/hrms-workspace";
import { getHRSession, publicSession } from "@/lib/hr-auth";

export const metadata: Metadata = {
  title: "HRMS · KretivOS",
  description: "Kretivco human resources management workspace",
};
export const dynamic = "force-dynamic";

export default async function HRMSPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const session = await getHRSession();
  if (!session) redirect("/hr/login");
  const params = await searchParams;
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  return <HRMSWorkspace initialTab={section} session={publicSession(session)} />;
}
