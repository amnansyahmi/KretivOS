"use client";

import { useEffect } from "react";

/**
 * Adds AI Office beside AI Studio in the existing dashboard navigation without
 * duplicating the large dashboard shell. The shell is currently inline in
 * app/page.tsx; this small bridge can be removed once navigation is extracted
 * into a shared component.
 */
export function OfficeNavLink() {
  useEffect(() => {
    const install = () => {
      if (document.querySelector('[data-ai-office-nav="true"]')) return true;
      const aside = document.querySelector("aside");
      if (!aside) return false;
      const aiStudio = Array.from(aside.querySelectorAll<HTMLAnchorElement>('a[href="/ai-studio"]'))[0];
      if (!aiStudio) return false;

      const link = aiStudio.cloneNode(true) as HTMLAnchorElement;
      link.href = "/office";
      link.setAttribute("data-ai-office-nav", "true");
      link.setAttribute("aria-label", "AI Office");
      link.title = aiStudio.title ? "AI Office" : "";
      const label = Array.from(link.querySelectorAll("span")).find((node) => node.textContent?.trim() === "AI Studio");
      if (label) label.textContent = "AI Office";
      aiStudio.insertAdjacentElement("afterend", link);
      return true;
    };

    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
