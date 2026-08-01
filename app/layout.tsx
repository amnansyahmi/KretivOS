import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AttendanceTestSession } from "@/components/attendance-test-session";
import { GlobalCommandPalette } from "@/components/command-palette";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm";
import { TooltipProvider } from "@/components/ui/tooltip";

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
          {/* delayDuration keeps a hint from flashing while the pointer crosses
              a toolbar; skipDelayDuration lets the next one appear at once. */}
          <TooltipProvider delayDuration={350} skipDelayDuration={200}>
            <ConfirmProvider>
              {children}
              <AttendanceTestSession />
              {/* Mounted at the root so ⌘K reaches every workspace. */}
              <GlobalCommandPalette />
            </ConfirmProvider>
          </TooltipProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
