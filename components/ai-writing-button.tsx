"use client";

import { useState } from "react";
import { Check, Loader2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AIWritingButtonProps = {
  value: string;
  field: string;
  context: string;
  onApply: (value: string) => void;
  className?: string;
  label?: string;
};

export function AIWritingButton({
  value,
  field,
  context,
  onApply,
  className,
  label = "Improve with AI",
}: AIWritingButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const eligible = value.trim().length >= 3 && value.length <= 3000;

  async function improve() {
    if (!eligible || state === "loading") return;
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/writing/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, field, context }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to improve this writing.");
      onApply(String(data.improved || value));
      setState("done");
      window.setTimeout(() => setState("idle"), 1800);
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : "AI writing is unavailable.");
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 bg-card px-2.5 text-[11px]"
        onClick={improve}
        disabled={!eligible || state === "loading"}
        title={message || (value.trim().length < 3 ? "Write a short draft first." : value.length > 3000 ? "Select or shorten this draft to 3,000 characters first." : label)}
      >
        {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "done" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <WandSparkles className="h-3.5 w-3.5" />}
        {state === "loading" ? "Improving…" : state === "done" ? "Improved" : label}
      </Button>
      {state === "error" && <span className="max-w-48 text-[10px] leading-4 text-red-600">{message}</span>}
    </span>
  );
}
