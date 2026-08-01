"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, Root } from "react-dom/client";
import { usePathname } from "next/navigation";
import { Building2, Check, ChevronDown, Search, X } from "lucide-react";
import { CUSTOM_INDUSTRY_OPTION, INDUSTRIES, INDUSTRY_GROUPS } from "@/lib/industries";
import { cn } from "@/lib/utils";

type FloatingPosition = {
  mobile: boolean;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function IndustryPicker({ input }: { input: HTMLInputElement }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(input.value || "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [position, setPosition] = useState<FloatingPosition>({ mobile: false, left: 16, top: 80, width: 420, maxHeight: 520 });

  useEffect(() => {
    const sync = () => setValue(input.value || "");
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    return () => {
      input.removeEventListener("input", sync);
      input.removeEventListener("change", sync);
    };
  }, [input]);

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mobile = window.innerWidth < 640;
    if (mobile) {
      setPosition({
        mobile: true,
        left: 12,
        top: Math.max(12, window.innerHeight * 0.16),
        width: Math.max(280, window.innerWidth - 24),
        maxHeight: Math.max(360, window.innerHeight * 0.8)
      });
      return;
    }

    const width = Math.min(Math.max(rect.width, 440), window.innerWidth - 32);
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
    const desiredHeight = Math.min(560, window.innerHeight - 32);
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const top = spaceBelow >= 380
      ? rect.bottom + 8
      : Math.max(16, rect.top - desiredHeight - 8);

    setPosition({ mobile: false, left, top, width, maxHeight: desiredHeight });
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const filteredGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return INDUSTRY_GROUPS;
    return INDUSTRY_GROUPS
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          option.toLowerCase().includes(term) || group.label.toLowerCase().includes(term)
        )
      }))
      .filter((group) => group.options.length > 0);
  }, [query]);

  function choose(next: string) {
    setReactInputValue(input, next);
    setValue(next);
    setOpen(false);
    setQuery("");
    setCustomMode(false);
    setCustomValue("");
  }

  function openPicker(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    setCustomMode(false);
  }

  const isMaintainedIndustry = INDUSTRIES.includes(value);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={openPicker}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-[.65rem] border bg-white px-3 text-left text-sm outline-none transition",
          "hover:border-[#ba5c42]/50 focus-visible:border-[#ba5c42] focus-visible:ring-4 focus-visible:ring-[#ba5c42]/10"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f2eee5] text-[#ba5c42]">
          <Building2 className="h-3.5 w-3.5" />
        </span>
        <span className={cn("min-w-0 flex-1 truncate", value ? "text-[#202820]" : "text-muted-foreground")}>
          {value || "Select an industry"}
        </span>
        {value && !isMaintainedIndustry && (
          <span className="hidden rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-amber-700 sm:inline-flex">
            Custom
          </span>
        )}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className={cn("fixed inset-0 z-[180]", position.mobile && "bg-black/35 backdrop-blur-[1px]")} onMouseDown={() => setOpen(false)}>
          <div
            className={cn(
              "fixed z-[181] flex overflow-hidden border border-black/10 bg-[#fbfaf6] shadow-2xl",
              position.mobile ? "flex-col rounded-2xl" : "flex-col rounded-xl"
            )}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight
            }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Choose customer industry"
          >
            <div className="flex items-start justify-between border-b bg-[#f7f4ed] px-4 py-4">
              <div>
                <div className="text-sm font-semibold">Choose industry</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Used across CRM, Brand DNA, funnels and reporting.</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-black/5 hover:text-foreground" aria-label="Close industry selector">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!customMode ? (
              <>
                <div className="border-b bg-white p-3">
                  <div className="kretivos-search-control flex h-11 items-center gap-2 rounded-xl border bg-[#fcfbf8] px-3 focus-within:border-[#ba5c42]/60 focus-within:ring-4 focus-within:ring-[#ba5c42]/10">
                    <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      placeholder="Search industry or category..."
                      aria-label="Search industries"
                    />
                    {query && <button type="button" onClick={() => setQuery("")} className="rounded p-1 text-muted-foreground hover:bg-black/5"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" role="listbox">
                  {filteredGroups.map((group) => (
                    <div key={group.label} className="mb-2 last:mb-0">
                      <div className="sticky top-0 z-[1] bg-[#fbfaf6]/95 px-3 py-2 text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground backdrop-blur-sm">
                        {group.label}
                      </div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {group.options.map((option) => {
                          const selected = option === value;
                          return (
                            <button
                              type="button"
                              key={option}
                              onClick={() => choose(option)}
                              className={cn(
                                "flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition",
                                selected ? "bg-[#202c25] text-white" : "hover:bg-[#f0ece3]"
                              )}
                              role="option"
                              aria-selected={selected}
                            >
                              <span className="min-w-0 flex-1">{option}</span>
                              {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {!filteredGroups.length && (
                    <div className="px-4 py-10 text-center">
                      <div className="text-sm font-medium">No matching industry</div>
                      <div className="mt-1 text-xs text-muted-foreground">Add it as a custom industry instead.</div>
                      <button type="button" onClick={() => { setCustomMode(true); setCustomValue(query); }} className="mt-4 rounded-lg bg-[#202c25] px-4 py-2 text-xs font-semibold text-white">
                        Use “{query}”
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t bg-[#f7f4ed] px-4 py-3">
                  <span className="text-[10px] text-muted-foreground">{INDUSTRIES.length} maintained industries</span>
                  <button type="button" onClick={() => { setCustomMode(true); setCustomValue(isMaintainedIndustry ? "" : value); }} className="text-xs font-semibold text-[#ba5c42] hover:underline">
                    {CUSTOM_INDUSTRY_OPTION}
                  </button>
                </div>
              </>
            ) : (
              <div className="p-4 sm:p-5">
                <button type="button" onClick={() => setCustomMode(false)} className="mb-4 text-xs font-semibold text-[#ba5c42] hover:underline">← Back to industry list</button>
                <label className="block text-xs font-medium">
                  Custom industry
                  <input
                    autoFocus
                    value={customValue}
                    onChange={(event) => setCustomValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && customValue.trim()) choose(customValue.trim());
                    }}
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-[#ba5c42] focus:ring-4 focus:ring-[#ba5c42]/10"
                    placeholder="Enter a specific industry"
                  />
                </label>
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Use a clear, reusable label. It will appear in customer filters and future AI recommendations.</p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setCustomMode(false)} className="h-10 rounded-lg border bg-white px-4 text-sm font-medium">Cancel</button>
                  <button type="button" disabled={!customValue.trim()} onClick={() => choose(customValue.trim())} className="h-10 rounded-lg bg-[#202c25] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Use custom industry</button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

type EnhancedRecord = {
  input: HTMLInputElement;
  host: HTMLDivElement;
  root: Root;
  previousDisplay: string;
};

export function IndustrySelectEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/business") return;

    const enhanced = new Map<HTMLInputElement, EnhancedRecord>();
    let scanFrame = 0;

    const cleanupDetached = () => {
      for (const [input, record] of enhanced) {
        if (document.body.contains(input)) continue;
        record.root.unmount();
        enhanced.delete(input);
      }
    };

    const scan = () => {
      cleanupDetached();
      document.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
        const firstTextNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (firstTextNode?.textContent?.trim().toLowerCase() !== "industry") return;

        const input = label.querySelector<HTMLInputElement>('input[class*="input"]');
        if (!input || enhanced.has(input) || input.dataset.kretivosIndustryEnhanced === "true") return;

        const fieldContainer = input.parentElement;
        if (!fieldContainer) return;

        const host = document.createElement("div");
        host.dataset.kretivosIndustryPicker = "true";
        host.className = "w-full";
        const previousDisplay = input.style.display;
        input.style.display = "none";
        input.dataset.kretivosIndustryEnhanced = "true";
        input.setAttribute("aria-hidden", "true");
        fieldContainer.appendChild(host);

        const root = createRoot(host);
        root.render(<IndustryPicker input={input} />);
        enhanced.set(input, { input, host, root, previousDisplay });
      });
    };

    const scheduleScan = () => {
      cancelAnimationFrame(scanFrame);
      scanFrame = requestAnimationFrame(scan);
    };

    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(scanFrame);
      for (const record of enhanced.values()) {
        record.root.unmount();
        if (document.body.contains(record.input)) {
          record.input.style.display = record.previousDisplay;
          delete record.input.dataset.kretivosIndustryEnhanced;
          record.input.removeAttribute("aria-hidden");
        }
        record.host.remove();
      }
      enhanced.clear();
    };
  }, [pathname]);

  return null;
}
