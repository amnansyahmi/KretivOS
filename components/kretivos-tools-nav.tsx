"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, ChevronUp, Eye, FileText, GripVertical, Home, Library,
  Plus, Target, Workflow, X
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "KretivOS Home", icon: Home },
  { href: "/funnels", label: "Funnel Library", icon: Target },
  { href: "/knowledge", label: "Knowledge Library", icon: Library },
  { href: "/knowledge/add", label: "Add Knowledge (.md)", icon: Plus },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/templates", label: "Templates", icon: FileText },
];

type Position = { x: number; y: number };

const POSITION_KEY = "kretivos-tools-position";
const HIDDEN_KEY = "kretivos-tools-hidden";

function clampPosition(position: Position): Position {
  if (typeof window === "undefined") return position;
  return {
    x: Math.max(12, Math.min(position.x, window.innerWidth - 156)),
    y: Math.max(12, Math.min(position.y, window.innerHeight - 64)),
  };
}

export function KretivOSToolsNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: 680 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    const savedPosition = localStorage.getItem(POSITION_KEY);
    const savedHidden = localStorage.getItem(HIDDEN_KEY);
    const fallback = { x: 20, y: window.innerHeight - 78 };

    if (savedPosition) {
      try {
        setPosition(clampPosition(JSON.parse(savedPosition) as Position));
      } catch {
        setPosition(fallback);
      }
    } else {
      setPosition(fallback);
    }

    setHidden(savedHidden === "true");
    setMounted(true);

    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  }, [position, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(HIDDEN_KEY, String(hidden));
  }, [hidden, mounted]);

  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }

  function stopDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!mounted) return null;

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-[90] flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-[#202c25] text-white shadow-xl"
        aria-label="Show KretivOS tools"
        title="Show KretivOS tools"
      >
        <Eye className="h-4 w-4" />
      </button>
    );
  }

  const dockRight = position.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 600);

  return (
    <div
      className="fixed z-[90] touch-none"
      style={{ left: position.x, top: position.y }}
    >
      {open && (
        <div
          className={cn(
            "absolute bottom-14 max-h-[min(70vh,560px)] w-[min(288px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-black/10 bg-[#202c25] p-2 text-white shadow-2xl",
            dockRight ? "right-0" : "left-0"
          )}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <div className="text-sm font-semibold">KretivOS tools</div>
              <div className="text-[10px] text-white/45">Drag the handle to move</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"
              aria-label="Close tools menu"
            >
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
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm transition",
                    active ? "bg-white text-[#202c25]" : "text-white/65 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          <button
            onClick={() => { setOpen(false); setHidden(true); }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/55 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />Hide floating tools
          </button>
        </div>
      )}

      <div className="flex items-center overflow-hidden rounded-full bg-[#ef7f5f] text-white shadow-xl">
        <button
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          className="flex h-12 w-10 cursor-grab items-center justify-center border-r border-white/15 active:cursor-grabbing"
          aria-label="Move tools button"
          title="Drag to move"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          onClick={() => setOpen((value) => !value)}
          className="flex h-12 items-center gap-2 px-3 text-sm font-semibold transition hover:bg-white/10"
          aria-expanded={open}
          aria-label="Open KretivOS tools menu"
        >
          <BookOpen className="h-4 w-4" />
          <span className="hidden min-[390px]:inline">Tools</span>
          <ChevronUp className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>

        <button
          onClick={() => { setOpen(false); setHidden(true); }}
          className="flex h-12 w-9 items-center justify-center border-l border-white/15 hover:bg-white/10"
          aria-label="Hide tools button"
          title="Hide tools"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
