import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { HREmployeeApp } from "@/components/hr-app";
import { getHRSession, publicSession } from "@/lib/hr-auth";

/**
 * The employee app.
 *
 * Its own manifest rather than KretivOS's, so installing this puts "Kretivco
 * HR" on a home screen that opens to clocking in — an employee who installed
 * the shared manifest would land on the command centre instead.
 */
export const metadata: Metadata = {
  title: "HR Portal · Kretivco",
  description: "Clock in, apply for leave, submit claims and read your payslips",
  manifest: "/hr-app.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kretivco HR" },
  /*
   * Stated rather than left to `icon.tsx` and `apple-icon.tsx`: the root layout
   * sets `icons` explicitly, and an explicit parent beats a child's file
   * convention, so without this the installed app would still wear KretivOS's
   * mark. The URLs are those two files' routes.
   */
  icons: { icon: "/hr/app/icon", apple: "/hr/app/apple-icon" },
};

/** Dark, because the app header is the first thing under the status bar. */
export const viewport: Viewport = {
  themeColor: "#202c25",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function HRAppPage() {
  const session = await getHRSession();
  if (!session) redirect("/hr/login");
  return <HREmployeeApp session={publicSession(session)} />;
}
