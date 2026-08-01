"use client";

/**
 * A confirmation you can `await`, so replacing `window.confirm` does not mean
 * restructuring fourteen components around an `open` state.
 *
 *   const confirm = useConfirm();
 *   if (!await confirm({ title: "Delete this invoice?", destructive: true })) return;
 *
 * The promise resolves false on cancel, on Escape and on unmount, so a caller
 * that only checks the truthy branch can never proceed by accident.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  /** What actually happens, and what cannot be undone. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // Held in a ref as well so close() can settle the promise exactly once even
  // when React batches the state update away.
  const settled = useRef(true);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      settled.current = false;
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      if (current && !settled.current) {
        settled.current = true;
        current.resolve(value);
      }
      return null;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return <ConfirmContext.Provider value={value}>
    {children}
    <AlertDialog
      open={pending !== null}
      // Covers Escape and the overlay: anything that is not the confirm button
      // is a decline.
      onOpenChange={(next) => { if (!next) close(false); }}
    >
      {pending && <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending.title}</AlertDialogTitle>
          {pending.description && <AlertDialogDescription>{pending.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {pending.cancelLabel || "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction destructive={pending.destructive} onClick={() => close(true)}>
            {pending.confirmLabel || (pending.destructive ? "Delete" : "Continue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>}
    </AlertDialog>
  </ConfirmContext.Provider>;
}

/**
 * Falls back to window.confirm when no provider is mounted, so a component
 * rendered outside the tree still asks rather than silently going ahead.
 */
export function useConfirm() {
  const context = useContext(ConfirmContext);
  return context ?? (async (options: ConfirmOptions) =>
    typeof window === "undefined" ? false : window.confirm(options.title));
}
