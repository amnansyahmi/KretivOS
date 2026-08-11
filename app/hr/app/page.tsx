import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { HREmployeeApp } from "@/components/hr-app";
import { getHRSession, publicSession } from "@/lib/hr-auth";
import { HR_STARTUP_IMAGES } from "./startup-images";

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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kretivco HR",
    // Launch screens, so opening the installed app shows the KretivHR mark on
    // the app's own background rather than a white flash. Generated per device
    // resolution — see `startup-images.ts`.
    startupImage: HR_STARTUP_IMAGES,
  },
  /*
   * Stated rather than left to file convention: the root layout sets `icons`
   * explicitly, and an explicit parent beats a child's convention, so without
   * this the installed app would still wear KretivOS's mark.
   */
  icons: { icon: "/icons/hr-icon-192.png", apple: "/icons/hr-apple-touch-180.png" },
};

/** Dark, because the app header is the first thing under the status bar. */
export const viewport: Viewport = {
  themeColor: "#202c25",
  width: "device-width",
  initialScale: 1,
  // An installed app should not pinch-zoom: it is a fixed layout with fixed
  // bars, and a zoomed one leaves the tab bar off-screen with no way back.
  // Safari ignores this in a browser tab, which is the right call there and
  // why the layout below also has to survive being zoomed.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function HRAppPage() {
  const session = await getHRSession();
  if (!session) redirect("/hr/login");
  return <HREmployeeApp session={publicSession(session)} />;
}
