"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarCheck,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  HandCoins,
  IdCard,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessagesSquare,
  Menu,
  ReceiptText,
  Settings2,
  Smartphone,
  UserCheck,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, VisuallyHidden,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type HRMSRole = "hr_admin" | "manager" | "employee" | "finance";
export type HRMSTab = "self" | "profile" | "overview" | "team" | "people" | "attendance" | "timesheet" | "leave" | "onboarding" | "lifecycle" | "goals" | "learning" | "claims" | "payslips" | "documents" | "settings";
export type HRMSSession = {
  userId: string;
  name: string;
  email: string;
  role: HRMSRole;
  expiresAt: string;
  authEnabled?: boolean;
};

type NavigationGroup = "Workspace" | "Workforce" | "Development" | "Finance & records" | "Administration";

export type HRMSNavigationItem = {
  id: HRMSTab;
  label: string;
  description: string;
  group: NavigationGroup;
  icon: LucideIcon;
  href: string;
};

export const HRMS_NAV_ITEMS: HRMSNavigationItem[] = [
  { id: "self", label: "My HR", description: "Everything waiting on you", group: "Workspace", icon: UserCheck, href: "/hr?section=self" },
  { id: "profile", label: "My Details", description: "View and edit your record", group: "Workspace", icon: IdCard, href: "/hr?section=profile" },
  { id: "overview", label: "Dashboard", description: "People operations overview", group: "Workspace", icon: LayoutDashboard, href: "/hr?section=overview" },
  { id: "team", label: "Team Hub", description: "News, calendar and organisation", group: "Workspace", icon: MessagesSquare, href: "/hr?section=team" },
  { id: "people", label: "People", description: "Directory and employee profiles", group: "Workforce", icon: Users, href: "/hr?section=people" },
  { id: "attendance", label: "Attendance", description: "Clock-in and work records", group: "Workforce", icon: Clock3, href: "/hr?section=attendance" },
  { id: "timesheet", label: "Timesheet", description: "Daily task log", group: "Workforce", icon: ListChecks, href: "/hr?section=timesheet" },
  { id: "leave", label: "Leave", description: "Balances, requests and approvals", group: "Workforce", icon: CalendarCheck, href: "/hr?section=leave" },
  { id: "onboarding", label: "Onboarding", description: "New joiner readiness", group: "Workforce", icon: ClipboardList, href: "/hr?section=onboarding" },
  { id: "lifecycle", label: "Lifecycle", description: "Probation, confirmation and exit", group: "Workforce", icon: BookOpenCheck, href: "/hr?section=lifecycle" },
  { id: "goals", label: "Performance", description: "Goals, progress and reviews", group: "Development", icon: BriefcaseBusiness, href: "/hr?section=goals" },
  { id: "learning", label: "Learning", description: "Training and certifications", group: "Development", icon: GraduationCap, href: "/hr?section=learning" },
  { id: "claims", label: "Claims", description: "Expenses and reimbursements", group: "Finance & records", icon: HandCoins, href: "/hr?section=claims" },
  { id: "payslips", label: "Payroll", description: "Protected payslips and payroll", group: "Finance & records", icon: ReceiptText, href: "/hr?section=payslips" },
  { id: "documents", label: "HR Documents", description: "Policies and staff documents", group: "Finance & records", icon: FileText, href: "/hr?section=documents" },
  { id: "settings", label: "Settings", description: "Lists, rules and policies", group: "Administration", icon: Settings2, href: "/hr?section=settings" },
];

const PERMITTED_TABS: Record<HRMSRole, HRMSTab[]> = {
  hr_admin: HRMS_NAV_ITEMS.map((item) => item.id),
  manager: ["self", "profile", "overview", "team", "people", "attendance", "leave", "onboarding", "lifecycle", "goals", "learning", "claims", "payslips", "documents"],
  finance: ["self", "profile", "overview", "team", "people", "timesheet", "claims", "payslips", "documents"],
  employee: ["self", "profile", "team", "attendance", "timesheet", "leave", "claims", "payslips", "documents"],
};

export const HR_VIEW_AS_KEY = "kretivos-hr-view-as";
export const HR_VIEW_AS_EVENT = "kretivos-hr-view-as-change";

/**
 * The two views worth building against, least access first.
 *
 * Manager and Finance still exist as roles — the API enforces them and records
 * may already carry them — but they are not offered here. Four lenses over one
 * workspace meant four half-checked variants of every screen; two means the
 * distinction that actually matters, between the person who runs HR and the
 * person who works here, gets made properly.
 */
export const HR_VIEW_AS_ROLES: { id: HRMSRole; label: string }[] = [
  { id: "employee", label: "Employee" },
  { id: "hr_admin", label: "HR Admin" },
];

/**
 * Which menus a session may see.
 *
 * With authentication switched off every visitor is handed the hr_admin role,
 * and this used to return every tab *except* "My HR" — so the person who just
 * wanted their leave balance was shown the payroll workbench and the org
 * settings, while the one screen built for them was the single one hidden.
 *
 * The floor is now the employee experience, and `viewAs` opts into the wider
 * menus. That is a view preference, not a permission boundary: with auth off
 * the API routes are open regardless, so this decides what is *shown*, never
 * what is *allowed*. Turning HRMS_AUTH_ENABLED on restores the real check
 * below, where the session's own role is the only thing consulted.
 */
export function getPermittedHRMSNavigation(session: HRMSSession, viewAs?: HRMSRole | null) {
  const role = session.authEnabled === false ? (viewAs ?? "employee") : session.role;
  if (role === "hr_admin") return HRMS_NAV_ITEMS;
  return HRMS_NAV_ITEMS.filter((item) => PERMITTED_TABS[role].includes(item.id));
}

/**
 * Reads the chosen lens, and keeps every mounted shell in step.
 *
 * The `storage` event only fires in *other* tabs, so a same-tab change needs
 * its own event — without it the sidebar would update while the workspace
 * beside it kept rendering the previous role's tabs.
 */
export function useHRViewAs(session: HRMSSession) {
  const disabled = session.authEnabled !== false;
  const [viewAs, setViewAsState] = useState<HRMSRole>("employee");

  useEffect(() => {
    if (disabled) return;
    const read = () => {
      const stored = localStorage.getItem(HR_VIEW_AS_KEY) as HRMSRole | null;
      if (stored && stored in PERMITTED_TABS) setViewAsState(stored);
    };
    read();
    window.addEventListener(HR_VIEW_AS_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(HR_VIEW_AS_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [disabled]);

  const setViewAs = useCallback((next: HRMSRole) => {
    setViewAsState(next);
    localStorage.setItem(HR_VIEW_AS_KEY, next);
    window.dispatchEvent(new Event(HR_VIEW_AS_EVENT));
  }, []);

  return { viewAs: disabled ? session.role : viewAs, setViewAs, canSwitch: !disabled };
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

type ViewAsControl = { value: HRMSRole; onChange: (role: HRMSRole) => void };

function SidebarContent({
  activeId,
  navigation,
  session,
  onNavigate,
  onClose,
  viewAs,
}: {
  activeId: HRMSTab;
  navigation: HRMSNavigationItem[];
  session: HRMSSession;
  onNavigate?: (id: HRMSTab) => void;
  onClose?: () => void;
  viewAs?: ViewAsControl | null;
}) {
  const router = useRouter();

  function navigate(item: HRMSNavigationItem) {
    onClose?.();
    if (onNavigate) onNavigate(item.id);
    else router.push(item.href);
  }

  async function signOut() {
    await fetch("/api/hr/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.replace("/hr/login");
  }

  return <div className="flex h-full min-h-0 flex-col bg-foreground text-white">
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
      <div className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-accent-muted"><UsersRound className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-accent-muted">Kretivco</div>
        <div className="mt-0.5 text-lg font-semibold tracking-tight">People & HR</div>
      </div>
      {onClose && <button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-white/65 hover:bg-white/10 hover:text-white" aria-label="Close HR menu"><X className="h-5 w-5" /></button>}
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="HRMS navigation">
      {navigation.map((item, index) => {
        const Icon = item.icon;
        const showGroup = index === 0 || navigation[index - 1].group !== item.group;
        const active = activeId === item.id;
        return <Fragment key={item.id}>
          {showGroup && <div className={cn("px-3 pb-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/35", index > 0 && "pt-5")}>{item.group}</div>}
          <button
            type="button"
            onClick={() => navigate(item)}
            className={cn(
              "group relative flex min-h-[48px] w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left transition",
              active ? "border-accent-soft bg-white/10 text-white" : "border-transparent text-white/62 hover:bg-white/[.06] hover:text-white"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent-muted" : "text-white/45 group-hover:text-white/75")} />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{item.label}</span>
              <span className={cn("mt-0.5 block truncate text-[10px]", active ? "text-white/55" : "text-white/32")}>{item.description}</span>
            </span>
          </button>
        </Fragment>;
      })}
    </nav>

    <div className="shrink-0 border-t border-white/10 p-3">
      <div className="mb-2 flex items-center gap-3 px-2 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-white/10 text-[10px] font-semibold">{initials(session.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{session.name}</div>
          <div className="mt-0.5 truncate text-[9px] capitalize text-white/40">{session.authEnabled === false ? "Shared workspace" : session.role.replace("_", " ")}</div>
        </div>
      </div>

      {/*
        * Only while authentication is off. Once it is on, the session's own role
        * decides the menus and offering a switch here would imply a permission
        * this cannot grant.
        */}
      {viewAs && <label className="mb-2 block px-2">
        <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[.14em] text-white/35">Viewing as</span>
        <select
          value={viewAs.value}
          onChange={(event) => viewAs.onChange(event.target.value as HRMSRole)}
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[.06] px-2.5 text-xs text-white outline-none focus:border-white/25"
        >
          {/* Native option styling ignores the parent, so the dark ground is set here. */}
          {HR_VIEW_AS_ROLES.map((role) => <option key={role.id} value={role.id} className="bg-foreground text-white">{role.label}</option>)}
        </select>
        <span className="mt-1.5 block text-[9px] leading-4 text-white/30">Changes which menus are shown. Sign-in is off, so it grants no extra access.</span>
      </label>}
      {/* The phone surface, findable from the desktop one. Installing it puts
          clocking in on a home screen. */}
      <Link href="/hr/app" onClick={onClose} className="mb-2 flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">
        <Smartphone className="h-4 w-4" />Employee app
      </Link>
      <Link href="/" onClick={onClose} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-xs font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">
        <ArrowLeft className="h-4 w-4" />Back to KretivOS
      </Link>
      {session.authEnabled !== false && <button onClick={signOut} className="mt-2 flex min-h-11 w-full items-center gap-3 px-3 text-xs font-medium text-white/45 transition hover:bg-white/[.06] hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>}
    </div>
  </div>;
}

export function HRMSShell({
  activeId,
  title,
  description,
  navigation,
  session,
  onNavigate,
  actions,
  children,
}: {
  activeId: HRMSTab;
  title: string;
  description: string;
  navigation: HRMSNavigationItem[];
  session: HRMSSession;
  onNavigate?: (id: HRMSTab) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  // Radix owns the scroll lock, the Escape handler and the focus trap.
  const [mobileOpen, setMobileOpen] = useState(false);
  const { viewAs, setViewAs, canSwitch } = useHRViewAs(session);
  const viewAsControl: ViewAsControl | null = canSwitch ? { value: viewAs, onChange: setViewAs } : null;

  return <main className="min-h-screen bg-background text-foreground">
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh self-start border-r border-black/10 lg:block">
        <SidebarContent activeId={activeId} navigation={navigation} session={session} onNavigate={onNavigate} viewAs={viewAsControl} />
      </aside>

      <div className="min-w-0 pb-24">
        <header className="sticky top-0 z-40 border-b border-black/5 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center gap-3 px-4 md:min-h-24 md:px-8 md:py-5">
            <Button variant="outline" size="icon" className="shrink-0 bg-card lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open HR navigation"><Menu className="h-5 w-5" /></Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[10px] font-semibold uppercase tracking-[.2em] text-accent sm:block">Kretivco people operations</div>
              <h1 className="truncate text-lg font-semibold tracking-tight sm:mt-1 md:text-3xl">{title}</h1>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:mt-1 sm:text-sm">{description}</p>
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-8 md:py-7">{children}</div>
      </div>
    </div>

    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[210] bg-black/55 lg:hidden"
        className="left-0 top-0 z-[220] h-full max-h-full w-[min(326px,88vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 lg:hidden"
      >
        <VisuallyHidden>
          <DialogTitle>HR navigation</DialogTitle>
          <DialogDescription>Move between the sections of the people operations workspace.</DialogDescription>
        </VisuallyHidden>
        <SidebarContent activeId={activeId} navigation={navigation} session={session} onNavigate={onNavigate} onClose={() => setMobileOpen(false)} viewAs={viewAsControl} />
      </DialogContent>
    </Dialog>
  </main>;
}
