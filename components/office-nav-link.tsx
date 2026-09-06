"use client";

import { useEffect } from "react";

/**
 * Adds AI Office beside AI Studio in the existing dashboard navigation without
 * duplicating the large dashboard shell. It keeps working on desktop/mobile and
 * after client-side navigation because the observer waits for the sidebar.
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
      // The cloned icon stays visually consistent with AI Studio; a small live
      // dot distinguishes the autonomous office without pulling another icon into the shell.
      if (!link.querySelector('[data-office-live-dot="true"]')) {
        const dot = document.createElement("span");
        dot.setAttribute("data-office-live-dot", "true");
        dot.setAttribute("aria-hidden", "true");
        dot.className = "ml-auto h-1.5 w-1.5 rounded-full bg-lime-300 shadow-[0_0_8px_rgba(190,242,100,.75)]";
        link.appendChild(dot);
      }
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
