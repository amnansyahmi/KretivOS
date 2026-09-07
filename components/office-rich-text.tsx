"use client";

import { Fragment, type ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++} className="font-semibold text-current">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={key++} className="rounded bg-black/[.08] px-1.5 py-0.5 font-mono text-[.92em]">{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (link) parts.push(<a key={key++} href={link[2]} target="_blank" rel="noreferrer" className="underline decoration-current/30 underline-offset-2 hover:decoration-current">{link[1]}</a>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isDivider(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines: string[], index: number) {
  return lines[index]?.includes("|") && Boolean(lines[index + 1]) && isDivider(lines[index + 1]);
}

export default function OfficeRichText({ content, tone = "dark", compact = false }: { content: string; tone?: "dark" | "light"; compact?: boolean }) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  const muted = tone === "light" ? "text-black/64" : "text-white/58";
  const heading = tone === "light" ? "text-[#182018]" : "text-white/86";
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) { i += 1; continue; }

    if (isTableStart(lines, i)) {
      const header = splitTableRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={key++} className={`my-4 max-w-full overflow-x-auto rounded-xl border ${tone === "light" ? "border-black/10 bg-white/45" : "border-white/[.08] bg-black/15"}`}>
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead className={tone === "light" ? "bg-black/[.035]" : "bg-white/[.035]"}>
              <tr>{header.map((cell, index) => <th key={index} className={`border-b px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[.08em] ${tone === "light" ? "border-black/10 text-black/55" : "border-white/[.08] text-white/55"}`}>{inline(cell)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className={tone === "light" ? "odd:bg-black/[.012]" : "odd:bg-white/[.012]"}>{header.map((_, cellIndex) => <td key={cellIndex} className={`border-b px-3 py-2.5 align-top text-[11px] leading-5 last:border-b-0 ${tone === "light" ? "border-black/[.06] text-black/65" : "border-white/[.05] text-white/58"}`}>{inline(row[cellIndex] || "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const classes = level === 1 ? "mt-5 text-xl" : level === 2 ? "mt-5 text-base" : "mt-4 text-sm";
      blocks.push(<div key={key++} className={`${classes} mb-2 font-semibold tracking-[-.015em] ${heading}`}>{inline(headingMatch[2])}</div>);
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key++} className={`my-5 border-0 border-t ${tone === "light" ? "border-black/10" : "border-white/[.08]"}`} />);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(<ul key={key++} className={`my-3 list-disc space-y-1.5 pl-5 ${compact ? "text-[10px] leading-5" : "text-[11px] leading-6 md:text-sm md:leading-7"} ${muted}`}>{items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push(<ol key={key++} className={`my-3 list-decimal space-y-1.5 pl-5 ${compact ? "text-[10px] leading-5" : "text-[11px] leading-6 md:text-sm md:leading-7"} ${muted}`}>{items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isTableStart(lines, i) && !/^(#{1,4})\s+/.test(lines[i]) && !/^[-*]\s+/.test(lines[i].trim()) && !/^\d+[.)]\s+/.test(lines[i].trim()) && !/^---+$/.test(lines[i].trim())) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(<p key={key++} className={`${compact ? "my-2 text-[10px] leading-5" : "my-3 text-[11px] leading-6 md:text-sm md:leading-7"} ${muted}`}>{inline(paragraph.join(" "))}</p>);
  }

  return <div className="min-w-0 max-w-full">{blocks.map((block, index) => <Fragment key={index}>{block}</Fragment>)}</div>;
}
