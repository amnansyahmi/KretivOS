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

export function MarkdownPreview({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let code: string[] = [];
  let inCode = false;
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    nodes.push(<ul key={`list-${nodes.length}`} className="my-4 list-disc space-y-1.5 pl-6 text-sm leading-7 text-[#4d574f]">{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>);
    list = [];
  };

  const flushCode = () => {
    if (!code.length) return;
    nodes.push(<pre key={`code-${nodes.length}`} className="my-4 overflow-x-auto rounded-xl bg-[#202c25] p-4 text-xs leading-6 text-white/80"><code>{code.join("\n")}</code></pre>);
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
    else if (line.startsWith("> ")) nodes.push(<blockquote key={index} className="my-4 border-l-4 border-[#ba5c42] bg-[#fff8f4] px-4 py-3 text-sm italic leading-7 text-[#596159]">{inline(line.slice(2))}</blockquote>);
    else nodes.push(<p key={index} className="text-sm leading-7 text-[#4d574f]">{inline(line)}</p>);
  });

  flushList();
  flushCode();

  return <div>{nodes}</div>;
}
