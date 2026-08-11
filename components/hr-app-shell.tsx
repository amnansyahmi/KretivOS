"use client";

/**
 * The employee app shell.
 *
 * `/hr` is a workspace: a sidebar of fifteen sections built for whoever runs
 * HR. An employee needs four things and reaches for them on a phone, usually
 * standing up, usually with one hand — so this is a separate surface with a
 * fixed header, four tabs along the bottom, and nothing else competing for the
 * screen. It installs as its own app rather than sharing KretivOS's manifest,
 * because "HR" on a home screen should open to clocking in, not to the command
 * centre.
 *
 * Nothing here is a permission boundary. The same API and the same role scoping
 * back both surfaces; this one only decides what is worth showing on a phone.
 */

import { type ReactNode } from "react";
import { ArrowLeft, Bell, FileText, House, Inbox, ListChecks, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppTab = "home" | "timesheet" | "requests" | "inbox" | "profile";

/** Five is the most a thumb can hit reliably, and the most iOS itself uses. */
export const APP_TABS: { id: AppTab; label: string; icon: typeof House }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "timesheet", label: "Timesheet", icon: ListChecks },
  { id: "requests", label: "Requests", icon: FileText },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "profile", label: "Profile", icon: User },
];

export function HRAppShell({
  title,
  tab,
  onTab,
  unread,
  pendingRequests,
  onBell,
  onBack,
  children,
}: {
  title: string;
  tab: AppTab;
  onTab: (tab: AppTab) => void;
  unread: number;
  pendingRequests: number;
  onBell: () => void;
  /** Present on a detail screen, which is a push over a tab rather than a tab. */
  onBack?: () => void;
  children: ReactNode;
}) {
  return <div className="flex min-h-dvh flex-col bg-background">
    {/*
      * Sticky rather than fixed: a fixed header needs the scroll container to
      * carry matching padding, and every screen would have to remember to. The
      * safe-area inset is what keeps the title clear of a notch when this runs
      * installed and full-bleed.
      */}
    <header className="sticky top-0 z-30 bg-foreground pt-[env(safe-area-inset-top)] text-white">
      <div className="flex h-14 items-center gap-3 px-5">
        {/*
          * Installed, there is no browser chrome and therefore no back button.
          * Every screen that is not a tab has to supply its own way out or it
          * is a dead end.
          */}
        {onBack && <button
          onClick={onBack}
          aria-label="Back"
          className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/85 transition active:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>}
        {/*
          * The mark alone, and only where there is no back button. The full
          * wordmark cannot go here — "Kretiv" is near-black and disappears into
          * this header — and at 390px a back arrow, a mark, a title and a bell
          * is one thing too many for the row.
          */}
        {!onBack && <img src="/icons/hr-mark.png" alt="" aria-hidden className="h-7 w-7 shrink-0" />}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
        <button
          onClick={onBell}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition active:bg-white/10"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-accent-soft ring-2 ring-foreground" />}
        </button>
      </div>
    </header>

    <main className="flex-1 px-4 pb-4 pt-4">{children}</main>

    {/*
      * The tab bar sits on the safe area rather than above it, so on a phone
      * with a home indicator the bar reaches the bottom of the screen the way a
      * native one does instead of floating with a strip of page beneath it.
      */}
    <nav
      className="sticky bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      aria-label="Employee app"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {APP_TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          const badge = item.id === "inbox" ? unread : item.id === "requests" ? pendingRequests : 0;
          return <button
            key={item.id}
            onClick={() => onTab(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="relative">
              <Icon className={cn("h-5 w-5", active && "text-accent")} strokeWidth={active ? 2.4 : 1.8} />
              {badge > 0 && <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">{badge > 9 ? "9+" : badge}</span>}
            </span>
            {item.label}
          </button>;
        })}
      </div>
    </nav>
  </div>;
}

/**
 * A quick action.
 *
 * The glyph carries no tile, no border and no colour fill of its own. A grid of
 * saturated rounded squares is the house style of every generated dashboard,
 * and it reads as decoration rather than as something to press — the label and
 * the spacing do that work here instead.
 */
export function AppAction({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof House;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return <button
    onClick={onClick}
    className="flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center transition active:bg-secondary"
  >
    <Icon className="h-6 w-6 text-foreground" strokeWidth={1.6} />
    <span className="text-[11px] font-medium leading-4 text-foreground">{label}</span>
    {hint && <span className="text-[9px] leading-3 text-muted-foreground">{hint}</span>}
  </button>;
}

/** A titled panel, the only container shape the app uses. */
export function AppCard({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-black/8 bg-card p-4 shadow-sm", className)}>
    {(title || action) && <div className="mb-3 flex items-center justify-between gap-3">
      {title && <h2 className="text-sm font-semibold">{title}</h2>}
      {action}
    </div>}
    {children}
  </section>;
}
