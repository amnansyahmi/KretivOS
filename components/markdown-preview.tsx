"use client";

import { Fragment } from "react";

function inline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-black/5 px-1.5 py-0.5 text-[.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/** Splits a table row on unescaped pipes, so `\|` can appear inside a cell. */
function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes("-");

function alignments(divider: string) {
  return splitRow(divider).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center" as const;
    if (right) return "right" as const;
    return "left" as const;
  });
}

export function MarkdownPreview({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let code: string[] = [];
  let inCode = false;
  let list: string[] = [];
  let table: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    nodes.push(<ul key={`list-${nodes.length}`} className="my-4 list-disc space-y-1.5 pl-6 text-sm leading-7 text-foreground-soft">{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
    list = [];
  };

  const flushTable = () => {
    if (!table.length) return;
    const rows = table;
    table = [];

    // A table needs a header and an alignment divider; otherwise emit the raw lines.
    if (rows.length < 2 || !isTableDivider(rows[1])) {
      rows.forEach((line, index) => nodes.push(<p key={`row-${nodes.length}-${index}`} className="text-sm leading-7 text-foreground-soft">{inline(line)}</p>));
      return;
    }

    const align = alignments(rows[1]);
    const header = splitRow(rows[0]);
    const body = rows.slice(2).map(splitRow);
    // Both class families are emitted: Tailwind for the in-app preview, and
    // md-align-* for the exported HTML, which only ships the document stylesheet.
    const cellAlign = (index: number) =>
      align[index] === "right" ? "text-right md-align-right"
        : align[index] === "center" ? "text-center md-align-center"
          : "text-left md-align-left";

    nodes.push(
      <div key={`table-${nodes.length}`} className="my-4 -mx-1 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr>{header.map((heading, index) => <th key={index} className={`border-b-2 border-foreground bg-background px-3 py-2 text-xs font-semibold ${cellAlign(index)}`}>{inline(heading)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td key={index} className={`border-b border-border px-3 py-2 leading-6 text-foreground-soft ${cellAlign(index)}`}>{inline(value)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    );
  };

  const flushCode = () => {
    if (!code.length) return;
    nodes.push(<pre key={`code-${nodes.length}`} className="my-4 overflow-x-auto rounded-xl bg-foreground p-4 text-xs leading-6 text-white/80"><code>{code.join("\n")}</code></pre>);
    code = [];
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (inCode) flushCode();
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    if (isTableRow(line)) {
      flushList();
      table.push(line);
      return;
    }
    flushTable();
    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    flushList();
    if (!line.trim()) {
      nodes.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }
    if (line.startsWith("### ")) nodes.push(<h3 key={index} className="mb-2 mt-6 text-lg font-semibold">{inline(line.slice(4))}</h3>);
    else if (line.startsWith("## ")) nodes.push(<h2 key={index} className="mb-3 mt-7 text-xl font-semibold">{inline(line.slice(3))}</h2>);
    else if (line.startsWith("# ")) nodes.push(<h1 key={index} className="mb-4 mt-2 text-2xl font-semibold tracking-tight">{inline(line.slice(2))}</h1>);
    else if (line.startsWith("> ")) nodes.push(<blockquote key={index} className="my-4 border-l-4 border-accent bg-card px-4 py-3 text-sm italic leading-7 text-foreground-soft">{inline(line.slice(2))}</blockquote>);
    else nodes.push(<p key={index} className="text-sm leading-7 text-foreground-soft">{inline(line)}</p>);
  });

  flushTable();
  flushList();
  flushCode();

  return <div>{nodes}</div>;
}
