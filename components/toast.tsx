"use client";

/**
 * Minimal toast layer.
 *
 * Every workspace had grown its own `notice` / `failure` string state, each
 * rendered in a slightly different box, and none of them auto-dismissed. This
 * gives one place to say "saved" or "that failed" without another piece of
 * per-page state, and without pulling in a toast library for what is ~80 lines.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DURATION = { success: 3200, info: 4000, error: 6500 } as const;

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((item) => item.id !== id)), []);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const text = String(message ?? "").trim();
    if (!text) return;
    const id = nextId++;
    // Cap the stack so a failing loop cannot bury the screen.
    setToasts((current) => [...current.slice(-3), { id, tone, message: text }]);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    toast,
    success: (message: string) => toast(message, "success"),
    error: (message: string) => toast(message, "error"),
  }), [toast]);

  return <ToastContext.Provider value={api}>
    {children}
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:pr-6">
      {toasts.map((item) => <ToastRow key={item.id} toast={item} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DURATION[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertTriangle : Info;
  const tones = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-700",
    info: "border-[#e3ded4] bg-white text-[#2b332c]",
  };

  return <div
    role="status"
    aria-live="polite"
    className={cn(
      "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg",
      "animate-in fade-in slide-in-from-bottom-2",
      tones[toast.tone],
    )}
  >
    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
    <span className="min-w-0 flex-1 leading-relaxed">{toast.message}</span>
    <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss" className="shrink-0 opacity-50 hover:opacity-100">
      <X className="h-3.5 w-3.5" />
    </button>
  </div>;
}

/**
 * Returns a no-op-safe API. Components outside the provider (or rendered during
 * a server pass) get a working object rather than a thrown error, so adding a
 * toast to a page can never be the thing that breaks it.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  return context ?? { toast: () => {}, success: () => {}, error: () => {} };
}
