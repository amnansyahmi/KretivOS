"use client";

/**
 * Reads the record a field sits inside, so "Generate with AI" knows what it is
 * writing about.
 *
 * Generating a description from the field label alone produces generic filler.
 * What makes it useful is the rest of the form: the customer, the brand, the
 * dates, the amounts already filled in. Rather than thread a snapshot prop
 * through eleven different Field wrappers — each of which has a differently
 * shaped draft object — the button reads the form it is rendered in. Any caller
 * that wants to be exact can still pass `details` explicitly, and marking a
 * container with `data-ai-subject` pins the boundary instead of leaving it to
 * the heuristic below.
 */

import type { SubjectDetail } from "@/lib/writing-assist";

const IGNORED_TYPES = new Set(["password", "hidden", "file", "checkbox", "radio", "submit", "button", "reset", "image", "search"]);
const MAX_DETAILS = 24;

/** Collapses whitespace and caps a string for the prompt. */
function tidy(text: string, max: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Finds the edge of "this record".
 *
 * An explicit marker wins, then a form, then the nearest ancestor holding
 * several fields — which is what a card or a dialog body looks like in this app.
 * The walk is bounded so a page-level container never becomes the record.
 */
function findContainer(anchor: HTMLElement): HTMLElement | null {
  const marked = anchor.closest<HTMLElement>("[data-ai-subject]") || anchor.closest("form");
  if (marked) return marked as HTMLElement;

  let node: HTMLElement | null = anchor.parentElement;
  for (let depth = 0; node && depth < 8; depth += 1) {
    if (node.querySelectorAll("input, textarea, select").length >= 3) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * The heading that names the record.
 *
 * The fields live in a card body while the customer and brand name live in the
 * card header, so the search continues into the ancestors — the name of the
 * thing is usually the most useful line in the whole snapshot.
 */
function findHeading(container: HTMLElement): string {
  let node: HTMLElement | null = container;
  for (let depth = 0; node && depth < 4; depth += 1) {
    const heading = node.querySelector<HTMLElement>("[data-ai-subject-title], h1, h2, h3");
    if (heading?.textContent?.trim()) return tidy(heading.textContent, 240);
    node = node.parentElement;
  }
  return "";
}

/** The visible label of one control, by whichever route the markup offers. */
function labelOf(control: HTMLElement): string {
  const aria = control.getAttribute("aria-label");
  if (aria) return tidy(aria, 80);

  const id = control.getAttribute("id");
  if (id) {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    const external = document.querySelector<HTMLElement>(`label[for="${escaped}"]`);
    if (external?.textContent) return tidy(external.textContent, 80);
  }

  // A wrapping label carries the AI buttons too, so read a copy with the
  // interactive parts removed rather than the raw text.
  const wrapping = control.closest("label") || control.parentElement?.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("button, input, textarea, select, option").forEach((node) => node.remove());
    if (clone.textContent) return tidy(clone.textContent, 80);
  }

  const placeholder = control.getAttribute("placeholder");
  return placeholder ? tidy(placeholder, 80) : "";
}

/** The value of one control, ignoring anything that is not really content. */
function valueOf(control: Element): string {
  if (control instanceof HTMLSelectElement) {
    const option = control.selectedOptions[0];
    return option && option.value ? tidy(option.textContent || option.value, 240) : "";
  }
  if (control instanceof HTMLInputElement) {
    if (IGNORED_TYPES.has(control.type)) return "";
    return tidy(control.value, 240);
  }
  if (control instanceof HTMLTextAreaElement) {
    // Line structure matters in list fields, so only spaces are collapsed.
    return control.value.replace(/[ \t]+/g, " ").trim().slice(0, 240);
  }
  return "";
}

/**
 * Collects the filled-in fields around `anchor`, skipping the field currently
 * being written so the model is not handed its own output as evidence.
 */
export function collectSubjectDetails(anchor: HTMLElement | null, skipLabel = ""): SubjectDetail[] {
  if (!anchor || typeof document === "undefined") return [];
  const container = findContainer(anchor);
  if (!container) return [];

  const details: SubjectDetail[] = [];
  const seen = new Set<string>();
  const skip = skipLabel.toLowerCase().trim();

  const heading = findHeading(container);
  if (heading) {
    details.push({ label: "Record", value: heading });
    seen.add("record");
  }

  container.querySelectorAll("input, textarea, select").forEach((control) => {
    if (details.length >= MAX_DETAILS) return;
    if (!(control instanceof HTMLElement)) return;
    if (control.closest("[data-ai-ignore]") || control.getAttribute("aria-hidden") === "true") return;
    if (control.getAttribute("role") === "searchbox") return;

    const value = valueOf(control);
    if (!value) return;
    const label = labelOf(control);
    if (!label) return;

    const key = label.toLowerCase();
    if (key === skip || seen.has(key)) return;
    seen.add(key);
    details.push({ label, value });
  });

  return details;
}
