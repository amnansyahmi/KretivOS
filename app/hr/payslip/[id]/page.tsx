"use client";

/**
 * The payslip preview.
 *
 * The same shape as the sales print preview, and for the same reason: a bare
 * page with no shell means the browser's own print dialogue sees a clean
 * document, so "Save as PDF" produces exactly what the employee receives.
 *
 * A draft still prints. It is warned about rather than blocked, because
 * previewing a period before closing it is a legitimate thing to want and the
 * warning is what stops the preview being mistaken for the real thing.
 */

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsivePrintDocument, PRINT_STYLES } from "@/components/print-document";
import type { PrintModel } from "@/lib/print-templates";

export default function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const requested = search.get("back") || "";
  // Only ever a path on this site: an open redirect from a "back" parameter is
  // the standard way a printable page becomes a phishing hop.
  const back = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/hr?section=payslips";

  const [model, setModel] = useState<PrintModel | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hr/payslip/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload.error) { setError(payload.error); return; }
        setModel(payload.model);
        setWarning(payload.warning ?? null);
      })
      .catch(() => { if (!cancelled) setError("Could not load the payslip."); });
    return () => { cancelled = true; };
  }, [id]);

  return <main className="ktpl-page min-h-screen bg-background py-6">
    <style>{`${PRINT_STYLES}
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        .ktpl-chrome { display: none !important; }
        .ktpl-page { min-height: 0 !important; padding: 0 !important; background: #fff !important; }
        .ktpl-preview-wrap { max-width: none !important; padding: 0 !important; }
      }
    `}</style>

    <div className="ktpl-chrome mx-auto mb-5 flex max-w-[210mm] items-center gap-3 px-4">
      <Button variant="outline" size="sm" asChild>
        <Link href={back}><ArrowLeft className="h-4 w-4" />Back</Link>
      </Button>
      <div className="flex-1" />
      <Button size="sm" onClick={() => window.print()} disabled={!model}>
        <Printer className="h-4 w-4" />Print or save as PDF
      </Button>
    </div>

    {error && <div className="ktpl-chrome mx-auto max-w-[210mm] px-4">
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    </div>}

    {warning && <div className="ktpl-chrome mx-auto mb-5 max-w-[210mm] px-4">
      <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <strong>Draft.</strong> {warning}
      </div>
    </div>}

    {!model && !error && <div className="ktpl-chrome flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />Preparing the payslip…
    </div>}

    {model && <div className="ktpl-preview-wrap mx-auto max-w-[210mm] px-4 sm:px-0">
      <ResponsivePrintDocument model={model} />
    </div>}
  </main>;
}
