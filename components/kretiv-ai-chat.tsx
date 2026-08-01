"use client";

/**
 * The header copilot drawer.
 *
 * Extracted from app/page.tsx, which had grown past 900 lines with this drawer
 * inlined at the bottom. Three things changed with the move:
 *
 *   - Answers stream token by token instead of the drawer sitting on a static
 *     "Reading company records…" line for the length of a deep-mode call.
 *   - Replies render as markdown. The model was already asked for tables and
 *     bold labels; the drawer was printing the raw asterisks.
 *   - Threads persist to Neon, so closing the drawer no longer discards the
 *     conversation, and the same thread is readable in AI Studio.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, History, Loader2, Plus, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownPreview } from "@/components/markdown-preview";
import { cn } from "@/lib/utils";

type ChatSource = { index: number; id: string; title: string; category: string; customerName: string };
type ChatMode = "fast" | "normal" | "deep";

type ChatTurn = {
  key: string;
  from: "user" | "ai";
  text: string;
  sources?: ChatSource[];
  grounded?: boolean;
  model?: string;
  streaming?: boolean;
  failed?: boolean;
};

const MODES: { value: ChatMode; label: string; hint: string }[] = [
  { value: "fast", label: "Fast", hint: "Quick lookups and short answers" },
  { value: "normal", label: "Normal", hint: "Balanced default" },
  { value: "deep", label: "Deep", hint: "Slower, for analysis and trade-offs" },
];

const THREAD_KEY = "kretivos-copilot-thread";
const MODE_KEY = "kretivos-copilot-mode";

const OPENING: ChatTurn = {
  key: "opening",
  from: "ai",
  text: "I can read the shared KretivOS record — pipeline, receivables, settlements, delivery and the knowledge library. Ask about the business and I will cite the entries I used.",
};

let turnCounter = 0;
const nextKey = () => `turn-${Date.now()}-${turnCounter++}`;

export function KretivAIChat({ onClose, module }: { onClose: () => void; module: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([OPENING]);
  const [mode, setMode] = useState<ChatMode>("normal");
  const [threadId, setThreadId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [historyNote, setHistoryNote] = useState("");
  const [copied, setCopied] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Follow the answer as it streams, but only when the operator is already at
  // the bottom — yanking the view while they are reading an earlier reply is worse
  // than letting new text arrive off-screen.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (atBottom) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/ai/threads?conversationId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.conversation) return false;
      const restored: ChatTurn[] = (payload.messages || []).map((item: any) => ({
        key: item.id,
        from: item.role === "assistant" ? "ai" : "user",
        text: item.content,
        sources: item.sources,
        grounded: item.sources?.length ? true : undefined,
        model: item.model,
      }));
      if (!restored.length) return false;
      setMessages([OPENING, ...restored]);
      setThreadId(id);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Resume the last thread on open. History is a convenience, so any failure here
  // leaves a working empty chat rather than an error screen.
  useEffect(() => {
    const storedMode = localStorage.getItem(MODE_KEY);
    if (storedMode && MODES.some((item) => item.value === storedMode)) setMode(storedMode as ChatMode);

    const stored = localStorage.getItem(THREAD_KEY);
    if (stored) void loadThread(stored);
  }, [loadThread]);

  useEffect(() => { localStorage.setItem(MODE_KEY, mode); }, [mode]);

  async function ensureThread() {
    if (threadId) return threadId;
    try {
      const response = await fetch("/api/ai/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", mode }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.conversationId) return "";
      setThreadId(payload.conversationId);
      localStorage.setItem(THREAD_KEY, payload.conversationId);
      return payload.conversationId as string;
    } catch {
      return "";
    }
  }

  /** Recording a turn is best-effort: history must never block the answer. */
  async function record(conversationId: string, turn: { role: "user" | "assistant"; content: string; sources?: ChatSource[]; model?: string }) {
    if (!conversationId || !turn.content) return;
    try {
      await fetch("/api/ai/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "append", conversationId, mode, ...turn }),
      });
    } catch {
      // Ignored deliberately — see above.
    }
  }

  async function run(history: ChatTurn[], conversationId: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    const answerKey = nextKey();
    setMessages([...history, { key: answerKey, from: "ai", text: "", streaming: true }]);

    const update = (patch: Partial<ChatTurn>) =>
      setMessages((current) => current.map((turn) => (turn.key === answerKey ? { ...turn, ...patch } : turn)));

    let answer = "";
    let sources: ChatSource[] | undefined;
    let model = "";

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          module,
          mode,
          stream: true,
          messages: history
            .filter((turn) => turn.key !== "opening" && !turn.failed)
            .map((turn) => ({ role: turn.from === "ai" ? "assistant" : "user", content: turn.text })),
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "AI request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
          if (!frame.startsWith("data:")) continue;

          let event: any;
          try {
            event = JSON.parse(frame.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === "meta") {
            sources = event.sources;
            update({ sources: event.sources, grounded: event.grounded });
          } else if (event.type === "delta") {
            answer += event.text;
            update({ text: answer });
          } else if (event.type === "done") {
            model = event.model || "";
            update({ model, streaming: false });
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }

      if (!answer) throw new Error("The AI returned an empty answer.");
      update({ streaming: false });
      await record(conversationId, { role: "assistant", content: answer, sources, model });
    } catch (error) {
      if (controller.signal.aborted) {
        // Stopped by the operator: keep whatever streamed rather than discarding it.
        update({ streaming: false });
        if (answer) await record(conversationId, { role: "assistant", content: answer, sources, model });
        return;
      }
      update({
        text: answer || (error instanceof Error ? error.message : "AI unavailable"),
        streaming: false,
        failed: !answer,
      });
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  async function send() {
    const question = message.trim();
    if (!question || loading) return;
    setMessage("");
    setLoading(true);

    const history: ChatTurn[] = [...messages, { key: nextKey(), from: "user", text: question }];
    setMessages(history);

    const conversationId = await ensureThread();
    await record(conversationId, { role: "user", content: question });
    await run(history, conversationId);
  }

  /** Drops the failed or unwanted answer and re-asks the previous question. */
  async function regenerate() {
    if (loading) return;
    const lastUser = [...messages].reverse().find((turn) => turn.from === "user");
    if (!lastUser) return;
    setLoading(true);
    const history = messages.slice(0, messages.findIndex((turn) => turn.key === lastUser.key) + 1);
    setMessages(history);
    await run(history, threadId);
  }

  async function startNewThread() {
    abortRef.current?.abort();
    localStorage.removeItem(THREAD_KEY);
    setThreadId("");
    setMessages([OPENING]);
    setHistoryOpen(false);
  }

  async function openHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (!next) return;
    setHistoryNote("");
    try {
      const response = await fetch("/api/ai/threads", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setHistoryNote(payload.error || "History is unavailable.");
        setThreads([]);
        return;
      }
      setThreads(payload.conversations || []);
      if (!payload.conversations?.length) setHistoryNote("No saved conversations yet.");
    } catch {
      setHistoryNote("History is unavailable.");
    }
  }

  async function copy(turn: ChatTurn) {
    try {
      await navigator.clipboard.writeText(turn.text);
      setCopied(turn.key);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      // Clipboard access can be denied; the text stays selectable either way.
    }
  }

  const streaming = messages.some((turn) => turn.streaming);

  return <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent
      showCloseButton={false}
      overlayClassName="z-[70] bg-black/25"
      // A right-hand sheet rather than a centred box: full height, flush to the
      // edge, so the conversation keeps the same shape it had before Radix.
      className="left-auto right-0 top-0 z-[80] flex h-full max-h-full w-full max-w-[460px] translate-x-0 translate-y-0 flex-col rounded-none border-y-0 border-r-0 bg-background p-0"
      onOpenAutoFocus={(event) => { event.preventDefault(); composerRef.current?.focus(); }}
    >
      <div className="flex h-[76px] shrink-0 items-center gap-3 border-b px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-white"><Bot className="h-5 w-5" /></div>
        <div className="min-w-0">
          <DialogTitle className="font-semibold">Kretiv AI</DialogTitle>
          <DialogDescription className="truncate text-[10px]">{module} · reads live company records</DialogDescription>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={openHistory} aria-label="Conversation history"><History className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={startNewThread} aria-label="New conversation"><Plus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {historyOpen && <div className="max-h-56 shrink-0 overflow-y-auto border-b bg-white/70 p-3">
        {historyNote && <p className="px-1 py-2 text-[11px] text-muted-foreground">{historyNote}</p>}
        {threads.map((thread) => <button
          key={thread.id}
          onClick={async () => { if (await loadThread(thread.id)) { localStorage.setItem(THREAD_KEY, thread.id); setHistoryOpen(false); } }}
          className={cn("mb-1 block w-full truncate rounded-lg px-2.5 py-2 text-left text-xs hover:bg-background", thread.id === threadId && "bg-background font-medium")}
        >
          {thread.title}
        </button>)}
      </div>}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((turn) => <div key={turn.key} className={cn("max-w-[87%]", turn.from === "user" && "ml-auto")}>
          <div className={cn(
            "rounded-xl px-4 py-3 text-sm leading-relaxed",
            turn.from === "user" ? "whitespace-pre-wrap bg-foreground text-white" : "border bg-card",
            turn.failed && "border-red-200 bg-red-50 text-red-700",
          )}>
            {turn.from === "user" || turn.failed
              ? turn.text
              : <div className="[&>div>*:first-child]:mt-0 [&>div>*:last-child]:mb-0"><MarkdownPreview content={turn.text} /></div>}
            {turn.streaming && !turn.text && <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading company records…</span>}
            {turn.streaming && turn.text && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom" />}
          </div>

          {turn.from === "ai" && !turn.streaming && turn.text && turn.key !== "opening" && <div className="mt-1.5 flex items-center gap-1">
            <button onClick={() => copy(turn)} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-card" aria-label="Mark all read">
              {copied === turn.key ? <><Check className="h-3 w-3" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
            </button>
            <button onClick={regenerate} disabled={loading} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-card disabled:opacity-40">
              <RefreshCw className="h-3 w-3" />Retry
            </button>
            {turn.model && <span className="ml-auto text-[9px] text-muted-foreground">{turn.model}</span>}
          </div>}

          {turn.from === "ai" && turn.sources && turn.sources.length > 0 && <div className="mt-2 space-y-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</div>
            {turn.sources.map((source) => <Link key={source.index} href="/knowledge" className="flex items-start gap-2 rounded-lg border bg-white/70 px-2.5 py-1.5 text-[10px] hover:bg-card">
              <span className="font-semibold text-accent">[{source.index}]</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{source.title}</span>
                <span className="text-muted-foreground">{[source.customerName, source.category].filter(Boolean).join(" · ")}</span>
              </span>
            </Link>)}
          </div>}

          {turn.from === "ai" && turn.grounded === false && turn.key !== "opening" && <div className="mt-1.5 text-[10px] text-muted-foreground">Answered without live records — nothing in the library matched.</div>}
        </div>)}
      </div>

      <div className="shrink-0 border-t bg-white/60 p-4">
        <div className="mb-3 flex items-center gap-1 rounded-lg border bg-card p-1">
          {MODES.map((item) => <button
            key={item.value}
            onClick={() => setMode(item.value)}
            title={item.hint}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
              mode === item.value ? "bg-foreground text-white" : "text-muted-foreground hover:bg-background",
            )}
          >{item.label}</button>)}
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto">
          {["What needs attention today?", "Which invoices are overdue?", "What does the Chef Ammar MoU say about payment?"].map((suggestion) => <button
            key={suggestion}
            onClick={() => setMessage(suggestion)}
            className="whitespace-nowrap rounded-full border bg-card px-3 py-1.5 text-[10px]"
          >{suggestion}</button>)}
        </div>

        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:border-accent">
          <Textarea
            ref={composerRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
            className="min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Ask about the business…"
          />
          {streaming
            ? <Button size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Stop generating"><X className="h-4 w-4" /></Button>
            : <Button size="icon" onClick={() => void send()} disabled={!message.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
