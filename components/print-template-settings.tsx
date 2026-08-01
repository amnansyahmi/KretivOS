"use client";

/**
 * Editing what the printed documents say.
 *
 * The layout is fixed in the renderer; this is where the words live. Notes are
 * edited one per line rather than as a numbered list, because the numbering is
 * the renderer's job — an operator deleting note 3 should not have to renumber
 * 4, 5 and 6 by hand.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import type { PrintTemplate } from "@/lib/print-templates";

const TYPES = ["Invoice", "Quotation", "Receipt"];

/** Tokens the notes understand, shown so nobody has to guess the spelling. */
const TOKENS = [
  ["{{bankName}}", "Bank name"],
  ["{{bankAccountNumber}}", "Account number"],
  ["{{paymentTermsDays}}", "Payment terms in days"],
  ["{{email}}", "Company email"],
  ["{{phone}}", "Company phone"],
];

export function PrintTemplateSettings() {
  const toast = useToast();
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [active, setActive] = useState("Invoice");
  const [draft, setDraft] = useState<PrintTemplate | null>(null);
  const [notesText, setNotesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/print-templates", { cache: "no-store" });
      const payload = await response.json();
      if (payload.error) { setError(payload.error); return; }
      setTemplates(payload.templates || []);
      setError("");
    } catch {
      setError("Could not load the print templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const found = templates.find((item) => item.documentType === active) || null;
    setDraft(found);
    setNotesText((found?.notes ?? []).join("\n"));
  }, [templates, active]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch("/api/print-templates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          notes: notesText.split("\n").map((line) => line.trim()).filter(Boolean),
          // Bank details belong to the business, not to one document type.
          applyBankToAll: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save.");
      toast.success(`${draft.documentType} template saved.`);
      await load();
    } catch (problem) {
      toast.error(problem instanceof Error ? problem.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card className="bg-white/80"><CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />Loading print templates…
  </CardContent></Card>;

  if (error) return <Card className="bg-white/80"><CardContent className="p-6 text-sm text-red-700">{error}</CardContent></Card>;

  return <Card className="bg-white/80">
    <CardHeader>
      <CardTitle>Printed documents</CardTitle>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        The wording on quotations, invoices and receipts. The layout — logo, company block,
        ruled table, totals, signatures — is fixed so the three stay a matching set.
      </p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-white p-1">
        {TYPES.map((type) => <button
          key={type}
          onClick={() => setActive(type)}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition ${
            active === type ? "bg-[#202c25] text-white" : "text-muted-foreground hover:bg-[#f4f1e8]"
          }`}
        >{type}</button>)}
      </div>

      {!draft && <p className="py-6 text-center text-sm text-muted-foreground">
        No template is set up for {active}.
      </p>}

      {draft && <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label className="block">
            <span className="mb-2 block">Heading</span>
            <Input value={draft.heading} onChange={(event) => setDraft({ ...draft, heading: event.target.value })} />
          </Label>
          <Label className="block">
            <span className="mb-2 block">Number label</span>
            <Input value={draft.numberLabel} onChange={(event) => setDraft({ ...draft, numberLabel: event.target.value })} />
          </Label>
          <Label className="block">
            <span className="mb-2 block">Bank name</span>
            <Input value={draft.bankName} onChange={(event) => setDraft({ ...draft, bankName: event.target.value })} placeholder="Maybank" />
          </Label>
          <Label className="block">
            <span className="mb-2 block">Bank account number</span>
            <Input value={draft.bankAccountNumber} onChange={(event) => setDraft({ ...draft, bankAccountNumber: event.target.value })} placeholder="5123 4567 8901" />
          </Label>
          <Label className="block">
            <span className="mb-2 block">Payment terms (days)</span>
            <Input
              type="number" min={0} max={365}
              value={draft.paymentTermsDays}
              onChange={(event) => setDraft({ ...draft, paymentTermsDays: Number(event.target.value) })}
            />
          </Label>
          <Label className="block">
            <span className="mb-2 block">Closing line</span>
            <Input value={draft.closingLine} onChange={(event) => setDraft({ ...draft, closingLine: event.target.value })} />
          </Label>
        </div>

        <Label className="block">
          <span className="mb-2 block">Notes — one per line, numbered automatically</span>
          <Textarea
            value={notesText}
            onChange={(event) => setNotesText(event.target.value)}
            className="min-h-44 font-mono text-[11px] leading-5"
          />
        </Label>

        <div className="rounded-lg border bg-[#faf8f3] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Available in notes</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {TOKENS.map(([token, meaning]) => <span key={token}>
              <code className="rounded bg-white px-1 py-0.5">{token}</code>
              <span className="ml-1 text-muted-foreground">{meaning}</span>
            </span>)}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            Bank details are shared across all three documents, so changing them here changes them everywhere.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Label className="block">
            <span className="mb-2 block">Left signature label</span>
            <Input value={draft.issuedByLabel} onChange={(event) => setDraft({ ...draft, issuedByLabel: event.target.value })} />
          </Label>
          <Label className="block">
            <span className="mb-2 block">Right signature label</span>
            <Input value={draft.acceptedByLabel} onChange={(event) => setDraft({ ...draft, acceptedByLabel: event.target.value })} />
          </Label>
        </div>

        <label className="flex items-center gap-3 rounded-xl border bg-[#fbfaf7] p-3 text-xs font-medium">
          <input
            type="checkbox"
            checked={draft.showSignatures}
            onChange={(event) => setDraft({ ...draft, showSignatures: event.target.checked })}
          />
          Print the signature lines
        </label>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save {draft.documentType.toLowerCase()} template
          </Button>
        </div>
      </>}
    </CardContent>
  </Card>;
}
