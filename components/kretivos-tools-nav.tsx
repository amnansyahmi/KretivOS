"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, ChevronUp, FileText, Home, Library, Plus, Target, Workflow, X } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "KretivOS Home", icon: Home },
  { href: "/funnels", label: "Funnel Library", icon: Target },
  { href: "/knowledge", label: "Knowledge Library", icon: Library },
  { href: "/knowledge/add", label: "Add Knowledge (.md)", icon: Plus },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/templates", label: "Templates", icon: FileText },
];

export function KretivOSToolsNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-[90] flex flex-col items-end gap-2">
      {open && (
        <div className="max-h-[70vh] w-[min(280px,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-black/10 bg-[#202c25] p-2 text-white shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <div className="text-sm font-semibold">KretivOS tools</div>
              <div className="text-[10px] text-white/45">Create and manage workspaces</div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white" aria-label="Close tools menu">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 space-y-1">
            {items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition",
                    active ? "bg-white text-[#202c25]" : "text-white/65 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 items-center gap-2 rounded-full bg-[#ef7f5f] px-4 text-sm font-semibold text-white shadow-xl transition hover:-translate-y-0.5"
        aria-expanded={open}
        aria-label="Open KretivOS tools menu"
      >
        <BookOpen className="h-4 w-4" />
        Tools
        <ChevronUp className={cn("h-4 w-4 transition", open && "rotate-180")} />
      </button>
    </div>
  );
}
