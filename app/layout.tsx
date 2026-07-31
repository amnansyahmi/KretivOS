import type { Metadata, Viewport } from "next";
import "./globals.css";
import { KretivOSToolsNav } from "@/components/kretivos-tools-nav";
import { AttendanceTestSession } from "@/components/attendance-test-session";
import { GlobalCommandPalette } from "@/components/command-palette";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "KretivOS",
  description: "Kretivco company operating system",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "KretivOS" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#202c25",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          {children}
          <KretivOSToolsNav />
          <AttendanceTestSession />
          {/* Mounted at the root so ⌘K reaches every workspace, not just the dashboard. */}
          <GlobalCommandPalette />
        </ToastProvider>
      </body>
    </html>
  );
}
