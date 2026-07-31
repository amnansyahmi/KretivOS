"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, BriefcaseBusiness, Eye, FileText, Home, Library,
  Plus, Target, Workflow, X
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "KretivOS Home", icon: Home },
  { href: "/business", label: "Business Workspace", icon: BriefcaseBusiness },
  { href: "/funnels", label: "Funnel Library", icon: Target },
  { href: "/knowledge", label: "Knowledge Library", icon: Library },
  { href: "/knowledge/add", label: "Add Knowledge (.md)", icon: Plus },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/templates", label: "Templates", icon: FileText }
];

type Position = { x: number; y: number };
const POSITION_KEY = "kretivos-tools-position";
const HIDDEN_KEY = "kretivos-tools-hidden";

function clampPosition(position: Position): Position {
  if (typeof window === "undefined") return position;
  return {
    x: Math.max(12, Math.min(position.x, window.innerWidth - 60)),
    y: Math.max(12, Math.min(position.y, window.innerHeight - 60))
  };
}

export function KretivOSToolsNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: 680 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const hideOnKnowledgeMobile = pathname.startsWith("/knowledge");

  useEffect(() => {
    const fallback = { x: 18, y: window.innerHeight - 76 };
    const savedPosition = localStorage.getItem(POSITION_KEY);
    const savedHidden = localStorage.getItem(HIDDEN_KEY);
    if (savedPosition) {
      try { setPosition(clampPosition(JSON.parse(savedPosition) as Position)); }
      catch { setPosition(fallback); }
    } else setPosition(fallback);
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

  function pointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (drag.moved) setPosition(clampPosition({ x: drag.originX + dx, y: drag.originY + dy }));
  }

  function pointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) setOpen((value) => !value);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!mounted) return null;
  if (hidden) {
    return <button onClick={() => setHidden(false)} className={cn("fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-[90] h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-[#202c25] text-white shadow-xl", hideOnKnowledgeMobile ? "hidden sm:flex" : "flex")} aria-label="Show KretivOS tools" title="Show KretivOS tools"><Eye className="h-4 w-4" /></button>;
  }

  const dockRight = position.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 600);
  const openAbove = position.y > (typeof window !== "undefined" ? window.innerHeight / 2 : 400);

  return <div className={cn("fixed z-[90] touch-none", hideOnKnowledgeMobile && "hidden sm:block")} style={{ left: position.x, top: position.y }}>
    {open && <div className={cn(
      "absolute max-h-[min(70vh,560px)] w-[min(288px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-black/10 bg-[#202c25] p-2 text-white shadow-2xl",
      dockRight ? "right-0" : "left-0",
      openAbove ? "bottom-14" : "top-14"
    )}>
      <div className="flex items-center justify-between px-3 py-2">
        <div><div className="text-sm font-semibold">KretivOS tools</div><div className="text-[10px] text-white/45">Drag the circle to move</div></div>
        <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white" aria-label="Close tools menu"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-1 space-y-1">{items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm transition", active ? "bg-white text-[#202c25]" : "text-white/65 hover:bg-white/10 hover:text-white")}><Icon className="h-4 w-4 shrink-0" /><span>{label}</span></Link>;
      })}</div>
      <button onClick={() => { setOpen(false); setHidden(true); }} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/55 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" />Hide floating button</button>
    </div>}

    <button
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      className="flex h-12 w-12 cursor-grab items-center justify-center rounded-full bg-[#ef7f5f] text-white shadow-xl transition hover:-translate-y-0.5 active:cursor-grabbing"
      aria-expanded={open}
      aria-label="Open or move KretivOS tools"
      title="Click to open · drag to move"
    >
      <BookOpen className="h-5 w-5" />
    </button>
  </div>;
}
