"use client";

/**
 * The print preview.
 *
 * A page rather than a modal, so the browser's own print dialogue sees a clean
 * document: no shell, no navigation, no sidebar. Everything outside .kdoc is
 * hidden at print time, which means "Save as PDF" from the same dialogue
 * produces exactly what the client receives.
 */

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsivePrintDocument, PRINT_STYLES } from "@/components/print-document";
import type { PrintModel } from "@/lib/print-templates";

export default function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const kind = search.get("kind") === "receipt" ? "receipt" : "document";
  const requestedBack = search.get("back") || "";
  const back = requestedBack.startsWith("/") && !requestedBack.startsWith("//")
    ? requestedBack
    : "/sales?tab=sales";

  const [model, setModel] = useState<PrintModel | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/print/${encodeURIComponent(id)}?kind=${kind}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload.error) { setError(payload.error); return; }
        setModel(payload.model);
        setWarning(payload.warning ?? null);
      })
      .catch(() => { if (!cancelled) setError("Could not load the document."); });
    return () => { cancelled = true; };
  }, [id, kind]);

  return <main className="kdoc-page min-h-screen bg-[#f5f2ea] py-6">
    <style>{`${PRINT_STYLES}
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        .kdoc-chrome { display: none !important; }
        .kdoc-page { min-height: 0 !important; padding: 0 !important; background: #fff !important; }
        .kdoc-preview-wrap { max-width: none !important; padding: 0 !important; }
      }
    `}</style>

    <div className="kdoc-chrome mx-auto mb-5 flex max-w-[210mm] items-center gap-3 px-4">
      <Button variant="outline" size="sm" asChild>
        <Link href={back}><ArrowLeft className="h-4 w-4" />Back</Link>
      </Button>
      <div className="flex-1" />
      <Button size="sm" onClick={() => window.print()} disabled={!model || Boolean(warning)}>
        <Printer className="h-4 w-4" />Print or save as PDF
      </Button>
    </div>

    {error && <div className="kdoc-chrome mx-auto max-w-[210mm] px-4">
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    </div>}

    {warning && <div className="kdoc-chrome mx-auto mb-5 max-w-[210mm] px-4">
      <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <strong>Printing is paused.</strong> {warning}
      </div>
    </div>}

    {!model && !error && <div className="kdoc-chrome flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />Preparing the document…
    </div>}

    {model && <div className="kdoc-preview-wrap mx-auto max-w-[210mm] px-4 sm:px-0">
      <ResponsivePrintDocument model={model} />
    </div>}
  </main>;
}
