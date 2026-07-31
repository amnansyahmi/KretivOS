"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const routes: Array<[string, string]> = [
  ["client workspaces", "/business?tab=customers"],
  ["customer onboarding", "/business?tab=onboarding"],
  ["hr & team", "/hr"],
  ["human resources", "/hr"],
  ["crm & pipeline", "/business?tab=crm"],
  ["sales & documents", "/business?tab=sales"],
  ["finance", "/business?tab=finance"],
  ["chef ammar financials", "/business?tab=finance"],
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
  ["brand & assets", "/brands"],
  ["brand dna", "/brands"],
  ["automations", "/automations"],
  ["new automation", "/automations"],
  ["templates", "/templates"],
  ["create template", "/templates"]
];

const deprecatedSidebarItems = new Set(["chef ammar financials"]);
const peopleIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

export function KretivOSRouteBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/") return;

    try {
      const savedView = JSON.parse(localStorage.getItem("kretivos-view") || "null");
      if (savedView === "Chef Ammar Financials") {
        localStorage.setItem("kretivos-view", JSON.stringify("Finance"));
      }
      if (savedView === "Knowledge") {
        router.replace("/knowledge");
        return;
      }
      if (savedView === "Brand & Assets") {
        router.replace("/brands");
        return;
      }
      if (savedView === "HR & Team") {
        router.replace("/hr");
        return;
      }
    } catch {}

    const cleanSidebar = () => {
      document.querySelectorAll<HTMLElement>("aside button").forEach((button) => {
        const label = (button.textContent || button.title || button.getAttribute("aria-label") || "").trim().toLowerCase();
        const deprecated = deprecatedSidebarItems.has(label);
        button.style.display = deprecated ? "none" : "";
        button.setAttribute("aria-hidden", deprecated ? "true" : "false");
      });

      const onboarding = Array.from(document.querySelectorAll<HTMLButtonElement>("aside button")).find((button) => {
        const label = (button.textContent || button.title || "").trim().toLowerCase();
        return label === "customer onboarding";
      });
      if (!onboarding?.parentElement) return;

      const existing = document.querySelector<HTMLButtonElement>('aside button[data-kretivos-hr-nav="true"]');
      const hrButton = onboarding.cloneNode(true) as HTMLButtonElement;
      hrButton.dataset.kretivosHrNav = "true";
      hrButton.title = onboarding.querySelector("span") ? "" : "HR & Team";
      hrButton.setAttribute("aria-label", "HR & Team");
      const icon = hrButton.querySelector("svg");
      if (icon) icon.outerHTML = peopleIcon;
      const textSpan = Array.from(hrButton.querySelectorAll("span")).find((span) => !span.className.includes("rounded-full"));
      if (textSpan) textSpan.textContent = "HR & Team";

      if (!existing) onboarding.insertAdjacentElement("afterend", hrButton);
      else if (existing.className !== hrButton.className || existing.innerHTML !== hrButton.innerHTML) existing.replaceWith(hrButton);
    };

    cleanSidebar();
    const observer = new MutationObserver(cleanSidebar);
    observer.observe(document.body, { childList: true, subtree: true });

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const clickable = target?.closest("button, a") as HTMLElement | null;
      if (!clickable) return;
      const text = (clickable.textContent || clickable.title || clickable.getAttribute("aria-label") || "").trim().toLowerCase();
      const match = routes.find(([label]) => text === label || text.includes(label));
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      router.push(match[1]);
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
    };
  }, [pathname, router]);

  return null;
}
