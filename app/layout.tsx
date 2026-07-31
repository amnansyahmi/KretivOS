import type { Metadata, Viewport } from "next";
import "./globals.css";
import { KretivOSToolsNav } from "@/components/kretivos-tools-nav";
import { KretivOSRouteBridge } from "@/components/kretivos-route-bridge";
import { IndustrySelectEnhancer } from "@/components/industry-select-enhancer";
import { AutomationRuntime } from "@/components/automation-runtime";

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
        {children}
        <KretivOSRouteBridge />
        <IndustrySelectEnhancer />
        <AutomationRuntime />
        <KretivOSToolsNav />
      </body>
    </html>
  );
}
