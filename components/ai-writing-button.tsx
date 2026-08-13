"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCcw, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collectSubjectDetails } from "@/lib/ai-form-context";
import type { SubjectDetail } from "@/lib/writing-assist";
import { cn } from "@/lib/utils";

/**
 * The two AI writing actions offered on a field.
 *
 * Improve rewrites what the user typed. Generate writes the field from the rest
 * of the record — it reads the surrounding form to work out what the record is
 * about first, so an empty field is no longer a dead end. Both actions keep the
 * previous value so a draft the user preferred is one click away.
 */

type Action = "improve" | "generate";

type AIWritingButtonProps = {
  value: string;
  field: string;
  context: string;
  onApply: (value: string) => void;
  className?: string;
  label?: string;
  generateLabel?: string;
  /** Set false on fields where writing from scratch makes no sense. */
  allowGenerate?: boolean;
  /**
   * The record this field belongs to. Passing it is more reliable than the
   * form-reading fallback, so prefer it wherever the draft object is to hand.
   */
  details?: Record<string, unknown> | SubjectDetail[] | (() => Record<string, unknown> | SubjectDetail[]);
  /** "auto" (default) follows the writer's language; "ms"/"en" force one. */
  language?: "auto" | "ms" | "en";
};

const LANGUAGE_BADGE: Record<string, { short: string; full: string }> = {
  malay: { short: "BM", full: "Written in Bahasa Melayu Malaysia" },
  english: { short: "EN", full: "Written in English" },
  mixed: { short: "BM + EN", full: "Kept your Malay-English mix" },
};

/**
 * Two buttons now share the row a single one used to have, and a field label
 * sits beside them. Where the row is narrow — a phone, or one of the tighter
 * two-column cards — the full names wrap it onto three lines, so the qualifier
 * is dropped and the verb, which is the part that tells the two actions apart,
 * is what survives. The row is measured rather than guessed from the viewport:
 * these fields sit in columns whose width has little to do with screen size.
 */
const ROOMY_ROW = 420;

function useTightRow(anchor: React.RefObject<HTMLElement | null>) {
  const [tight, setTight] = useState(false);

  useEffect(() => {
    const row = anchor.current?.parentElement || anchor.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setTight(entry.contentRect.width < ROOMY_ROW));
    observer.observe(row);
    return () => observer.disconnect();
  }, [anchor]);

  return tight;
}

export function AIWritingButton({
  value,
  field,
  context,
  onApply,
  className,
  label = "Improve with AI",
  generateLabel = "Generate with AI",
  allowGenerate = true,
  details,
  language = "auto",
}: AIWritingButtonProps) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [done, setDone] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<{ text: string; title: string } | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const timers = useRef<number[]>([]);
  const tight = useTightRow(anchor);
  const fit = (text: string) => (tight ? text.split(" ")[0] : text);

  function clearTimers() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }

  useEffect(() => clearTimers, []);

  function later(callback: () => void, delay: number) {
    timers.current.push(window.setTimeout(callback, delay));
  }

  const tooLong = value.length > 3000;
  const canImprove = value.trim().length >= 3 && !tooLong;

  async function run(action: Action) {
    if (busy) return;
    // A second action restarts the clock; otherwise the first run's timer wipes
    // the undo the user has only just been offered.
    clearTimers();
    setBusy(action);
    setMessage("");
    setNote(null);

    try {
      const resolved = typeof details === "function" ? details() : details;
      const record = resolved ?? collectSubjectDetails(anchor.current, field);
      const response = await fetch(`/api/writing/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, field, context, details: record, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI writing is unavailable.");

      const next = String((action === "improve" ? data.improved : data.generated) || "");
      if (!next) throw new Error("AI returned nothing to apply.");

      setPrevious(value);
      onApply(next);
      setBusy(null);
      setDone(action);
      // The source matters: a starter draft is the offline fallback, and saying
      // so stops it being mistaken for the model's work. Otherwise the badge
      // reports the language it wrote in, which is the thing users check first.
      const badge = LANGUAGE_BADGE[String(data.language)];
      setNote(
        data.source === "starter"
          ? {
              text: action === "improve" ? "Tidied offline" : "Drafted offline",
              title: "AI was unavailable, so this came from the record itself. Edit before using it.",
            }
          : badge
            ? { text: badge.short, title: badge.full }
            : null,
      );
      later(() => setDone(null), 2200);
      later(() => {
        setPrevious(null);
        setNote(null);
      }, 20000);
    } catch (cause) {
      setBusy(null);
      setMessage(cause instanceof Error ? cause.message : "AI writing is unavailable.");
    }
  }

  function undo() {
    if (previous === null) return;
    clearTimers();
    onApply(previous);
    setPrevious(null);
    setDone(null);
    setNote(null);
  }

  const improveTitle = message
    || (tooLong ? "Select or shorten this draft to 3,000 characters first." : "")
    || (value.trim().length < 3 ? "Write a short draft first, or use Generate with AI." : label);

  return (
    <span ref={anchor} className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 bg-card px-2.5 text-[11px]"
        onClick={() => run("improve")}
        disabled={!canImprove || busy !== null}
        title={improveTitle}
        // The visible text shortens in a narrow row; the accessible name must
        // not, or a screen reader is told only half of what the button does.
        aria-label={label}
        aria-busy={busy === "improve"}
      >
        {busy === "improve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done === "improve" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <WandSparkles className="h-3.5 w-3.5" />}
        {busy === "improve" ? "Improving…" : done === "improve" ? "Improved" : fit(label)}
      </Button>

      {allowGenerate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 bg-card px-2.5 text-[11px]"
          onClick={() => run("generate")}
          disabled={busy !== null}
          title={value.trim() ? "Rewrite this field from the record, using what you typed as the brief." : "Write this field from the rest of this record."}
          aria-label={generateLabel}
          aria-busy={busy === "generate"}
        >
          {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done === "generate" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy === "generate" ? "Generating…" : done === "generate" ? "Generated" : fit(generateLabel)}
        </Button>
      )}

      {previous !== null && !busy && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-[11px] text-muted-foreground"
          onClick={undo}
          title="Put back what was here before the AI edit."
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Undo
        </Button>
      )}

      {note && !message && (
        <span className="text-[10px] leading-4 text-muted-foreground" title={note.title}>{note.text}</span>
      )}
      {message && <span aria-live="polite" className="max-w-48 text-[10px] leading-4 text-red-600">{message}</span>}
    </span>
  );
}
