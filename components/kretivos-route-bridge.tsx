"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const routes: Array<[string, string]> = [
  ["client workspaces", "/business?tab=customers"],
  ["customer onboarding", "/business?tab=onboarding"],
  ["crm & pipeline", "/business?tab=crm"],
  ["sales & documents", "/business?tab=sales"],
  ["finance", "/business?tab=finance"],
  ["weekly settlement", "/business?tab=settlements"],
  ["projects & delivery", "/business?tab=projects"],
  ["new opportunity", "/business?tab=crm"],
  ["record transaction", "/business?tab=finance"],
  ["new project", "/business?tab=projects"],
  ["onboard client", "/business?tab=onboarding"],
  ["add knowledge", "/knowledge/add"],
  ["knowledge", "/knowledge"],
  ["funnel builder", "/funnels"],
  ["add funnel", "/funnels"],
  ["automations", "/automations"],
  ["new automation", "/automations"],
  ["templates", "/templates"],
  ["create template", "/templates"]
];

export function KretivOSRouteBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/") return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const clickable = target?.closest("button, a") as HTMLElement | null;
      if (!clickable) return;
      const text = (clickable.textContent || "").trim().toLowerCase();
      const match = routes.find(([label]) => text === label || text.includes(label));
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      router.push(match[1]);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, router]);

  return null;
}
