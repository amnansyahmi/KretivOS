"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, Bot, Check, ChevronLeft, Circle, Copy, Database, Download, Globe2,
  Image as ImageIcon, Library, Loader2, MessageSquareText, Plus, RefreshCw,
  Save, Send, Settings2, Sparkles, ThumbsDown, ThumbsUp, WandSparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MarkdownPreview } from "@/components/markdown-preview";
import { WorkspacePage } from "@/components/workspace-page";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string; customerId: string; customerName: string; title: string; mode: string; model: string;
  useCompanyData: boolean; useCloudRag: boolean; useTools: boolean; city: string;
  preview: string; messageCount: number; updatedAt: string;
};
type Message = {
  id: string; conversationId: string; role: "user" | "assistant"; content: string; model: string;
  mode: string; sources: { index: number; id: string; title: string; category: string; customerName: string }[];
  usage: Record<string, any>; feedback: string; createdAt: string;
};
type Template = {
  id: string; name: string; category: string; description: string; prompt: string; mode: string;
  useCompanyData: boolean; useCloudRag: boolean; useTools: boolean;
};
type SavedOutput = {
  id: string; conversationId: string; messageId: string; customerId: string; customerName: string;
  title: string; outputType: string; content: string; updatedAt: string;
};
type Status = {
  online: boolean; origin: string; latencyMs?: number; error?: string; models: string[];
  health?: Record<string, any>; image?: { enabled?: boolean; model?: string; daily_limit?: number; usage_today?: number; styles?: string[] };
};
type StudioData = {
  conversations: Conversation[]; messages: Message[]; savedOutputs: SavedOutput[]; templates: Template[];
  customers: { id: string; name: string }[]; usage: { requests: number; total_tokens: number; failures: number };
};
type Settings = {
  customerId: string; mode: string; model: string; useCompanyData: boolean; useCloudRag: boolean;
  useTools: boolean; city: string;
};

const emptyData: StudioData = { conversations: [], messages: [], savedOutputs: [], templates: [], customers: [], usage: { requests: 0, total_tokens: 0, failures: 0 } };
const defaultSettings: Settings = { customerId: "", mode: "normal", model: "", useCompanyData: true, useCloudRag: true, useTools: true, city: "Kuala Lumpur" };
const modes = [
  { id: "fast", label: "Fast", note: "Short tasks" },
  { id: "normal", label: "Normal", note: "Daily work" },
  { id: "deep", label: "Deep", note: "Analysis" },
];

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

const compact = (value: number) => Number(value || 0).toLocaleString("en-MY");
const relative = (value: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
};

export default function AiStudioPage() {
  const confirm = useConfirm();
  const [data, setData] = useState<StudioData>(emptyData);
  const [status, setStatus] = useState<Status>({ online: false, origin: "", models: [] });
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<"history" | "saved" | "templates">("history");
  const [mobileList, setMobileList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [studioMode, setStudioMode] = useState<"chat" | "image">("chat");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("realistic");
  const [generatedImage, setGeneratedImage] = useState<{ dataUrl: string; promptUsed: string; model: string; usageToday: number; dailyLimit: number } | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load(conversationId = activeId, selectFirst = false) {
    setLoading(true);
    setError("");
    try {
      const [studio, service] = await Promise.all([
        jsonRequest(`/api/ai/studio${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`, { cache: "no-store" }),
        jsonRequest("/api/ai/status", { cache: "no-store" }).catch((cause) => ({ online: false, models: [], origin: "", error: cause.message })),
      ]);
      setData(studio);
      setStatus(service);
      if (conversationId) setMessages(studio.messages || []);
      else if (selectFirst && studio.conversations[0]) await openConversation(studio.conversations[0], studio);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load AI Studio.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load("", true); }, []);
  useEffect(() => {
    const handoff = localStorage.getItem("kretivos-ai-studio-image-prompt");
    const imageMode = new URLSearchParams(window.location.search).get("mode") === "image";
    if (handoff) {
      setImagePrompt(handoff);
      localStorage.removeItem("kretivos-ai-studio-image-prompt");
    }
    if (imageMode || handoff) setStudioMode("image");
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  async function openConversation(conversation: Conversation, knownData = data) {
    setActiveId(conversation.id);
    setSettings({
      customerId: conversation.customerId, mode: conversation.mode || "normal", model: conversation.model,
      useCompanyData: conversation.useCompanyData, useCloudRag: conversation.useCloudRag,
      useTools: conversation.useTools, city: conversation.city || "Kuala Lumpur",
    });
    setMobileList(false);
    try {
      const result = await jsonRequest(`/api/ai/studio?conversationId=${encodeURIComponent(conversation.id)}`, { cache: "no-store" });
      setData({ ...knownData, ...result });
      setMessages(result.messages || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open conversation."); }
  }

  function newConversation() {
    setActiveId("");
    setMessages([]);
    setPrompt("");
    setSettings(defaultSettings);
    setStudioMode("chat");
    setMobileList(false);
    setNotice("New AI workspace ready.");
  }

  async function send() {
    const text = prompt.trim();
    if (!text || sending) return;
    setPrompt("");
    setSending(true);
    setError("");
    const optimistic: Message = { id: `local-${Date.now()}`, conversationId: activeId, role: "user", content: text, model: "", mode: settings.mode, sources: [], usage: {}, feedback: "", createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    try {
      const result = await jsonRequest("/api/ai/studio", {
        method: "POST",
        body: JSON.stringify({ action: "chat", conversationId: activeId, message: text, ...settings }),
      });
      setActiveId(result.conversationId);
      setMessages((current) => [...current.filter((item) => item.id !== optimistic.id), { ...optimistic, conversationId: result.conversationId }, result.message]);
      const refreshed = await jsonRequest(`/api/ai/studio?conversationId=${encodeURIComponent(result.conversationId)}`, { cache: "no-store" });
      setData(refreshed);
      setMessages(refreshed.messages || []);
    } catch (cause) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setPrompt(text);
      setError(cause instanceof Error ? cause.message : "AI request failed.");
    } finally { setSending(false); }
  }

  function applyTemplate(template: Template) {
    setPrompt(template.prompt);
    setSettings((current) => ({ ...current, mode: template.mode, useCompanyData: template.useCompanyData, useCloudRag: template.useCloudRag, useTools: template.useTools }));
    setStudioMode("chat");
    setPanel("history");
    setMobileList(false);
    setNotice(`${template.name} loaded. Add any specific detail before sending.`);
  }

  async function saveMessage(message: Message) {
    try {
      await jsonRequest("/api/ai/studio", {
        method: "POST",
        body: JSON.stringify({
          action: "save_output", conversationId: activeId, messageId: message.id,
          customerId: settings.customerId, title: data.conversations.find((item) => item.id === activeId)?.title || "Saved AI output",
          outputType: "AI response", content: message.content, model: message.model, mode: message.mode,
        }),
      });
      setNotice("Output saved to the shared AI library.");
      await load(activeId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save output."); }
  }

  async function feedback(messageId: string, value: "up" | "down") {
    try {
      await jsonRequest("/api/ai/studio", { method: "POST", body: JSON.stringify({ action: "feedback", messageId, feedback: value }) });
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, feedback: item.feedback === value ? "" : value } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save feedback."); }
  }

  async function archive() {
    if (!activeId || !await confirm({ title: "Archive this conversation?", description: "It leaves the list but the transcript is kept.", confirmLabel: "Archive" })) return;
    try {
      await jsonRequest(`/api/ai/studio?id=${encodeURIComponent(activeId)}`, { method: "DELETE" });
      newConversation();
      await load("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to archive conversation."); }
  }

  async function generateImage() {
    if (!imagePrompt.trim() || generatingImage) return;
    setGeneratingImage(true);
    setError("");
    try {
      setGeneratedImage(await jsonRequest("/api/ai/image", { method: "POST", body: JSON.stringify({ prompt: imagePrompt, style: imageStyle, size: "1024x1024" }) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to generate image."); }
    finally { setGeneratingImage(false); }
  }

  const activeConversation = data.conversations.find((item) => item.id === activeId);
  const groupedTemplates = useMemo(() => Object.entries(data.templates.reduce((groups, template) => {
    (groups[template.category] ||= []).push(template); return groups;
  }, {} as Record<string, Template[]>)), [data.templates]);

  return <WorkspacePage
    eyebrow="AI operating layer"
    title="Kretiv AI Studio"
    description="One workspace for ai-nonymauz-cloud: live KretivOS context, cloud RAG, web tools, model routing, reusable prompts, image generation and shared history."
    actions={<div className="flex flex-wrap items-center gap-2"><ServiceBadge status={status} /><Button asChild variant="outline" className="bg-white"><Link href="/?view=Prompt%20Lab"><WandSparkles className="h-4 w-4" />Prompt Lab</Link></Button><Button variant="outline" className="bg-white" onClick={() => load(activeId)} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Refresh</Button><Button onClick={newConversation}><Plus className="h-4 w-4" />New</Button></div>}
  >
    {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}
    {error && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

    <div className="mb-4 grid grid-cols-3 gap-2 md:max-w-xl">
      <MiniStat label="30-day requests" value={compact(data.usage.requests)} />
      <MiniStat label="Tokens routed" value={compact(data.usage.total_tokens)} />
      <MiniStat label="Cloud knowledge" value={`${Number(status.health?.knowledge_chunks || 0)} chunks`} />
    </div>

    <div className="grid min-h-[720px] overflow-hidden rounded-2xl border bg-[#faf8f3] shadow-sm xl:grid-cols-[310px_minmax(0,1fr)_300px]">
      <aside className={cn("border-r bg-[#202c25] text-white", mobileList ? "fixed inset-0 z-[160] block overflow-y-auto" : "hidden xl:block")}>
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#202c25] p-4">
          <div className="flex items-center justify-between"><div className="text-sm font-semibold">AI workspace</div><button className="xl:hidden" onClick={() => setMobileList(false)}><X className="h-5 w-5" /></button></div>
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">{(["history", "saved", "templates"] as const).map((item) => <button key={item} onClick={() => setPanel(item)} className={cn("rounded-lg px-2 py-2 text-[10px] capitalize", panel === item ? "bg-white text-[#202c25]" : "text-white/55 hover:text-white")}>{item}</button>)}</div>
        </div>
        <div className="p-3">
          {panel === "history" && <div className="space-y-2"><button onClick={newConversation} className="mb-2 flex w-full items-center gap-2 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/70 hover:bg-white/10"><Plus className="h-4 w-4" />New conversation</button>{data.conversations.map((conversation) => <button key={conversation.id} onClick={() => openConversation(conversation)} className={cn("w-full rounded-xl p-3 text-left transition", activeId === conversation.id ? "bg-white text-[#202c25]" : "text-white/65 hover:bg-white/8 hover:text-white")}><div className="truncate text-sm font-medium">{conversation.title}</div><div className={cn("mt-1 flex items-center justify-between text-[10px]", activeId === conversation.id ? "text-[#687169]" : "text-white/35")}><span>{conversation.customerName} · {conversation.mode}</span><span>{relative(conversation.updatedAt)}</span></div></button>)}{!data.conversations.length && <EmptyDark text="No shared conversations yet." />}</div>}
          {panel === "saved" && <div className="space-y-2">{data.savedOutputs.map((output) => <button key={output.id} onClick={() => { setMessages([{ id: output.messageId, conversationId: output.conversationId, role: "assistant", content: output.content, model: "", mode: "", sources: [], usage: {}, feedback: "", createdAt: output.updatedAt }]); setActiveId(output.conversationId); setMobileList(false); }} className="w-full rounded-xl border border-white/10 p-3 text-left text-white/65 hover:bg-white/8 hover:text-white"><div className="line-clamp-2 text-sm font-medium">{output.title}</div><div className="mt-2 text-[10px] text-white/35">{output.customerName} · {relative(output.updatedAt)}</div></button>)}{!data.savedOutputs.length && <EmptyDark text="Save useful AI responses and they will appear here." />}</div>}
          {panel === "templates" && <div className="space-y-4">{groupedTemplates.map(([category, templates]) => <div key={category}><div className="mb-2 px-1 text-[9px] font-semibold uppercase tracking-[.18em] text-white/30">{category}</div><div className="space-y-2">{templates.map((template) => <button key={template.id} onClick={() => applyTemplate(template)} className="w-full rounded-xl border border-white/10 p-3 text-left text-white/70 hover:bg-white/8 hover:text-white"><div className="text-sm font-medium">{template.name}</div><div className="mt-1 text-[10px] leading-5 text-white/35">{template.description}</div></button>)}</div></div>)}</div>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col bg-[#f7f4ed]">
        <div className="flex min-h-[70px] flex-wrap items-center gap-x-3 gap-y-2 border-b bg-white/70 px-3 py-3 sm:flex-nowrap sm:px-5">
          <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setMobileList(true)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1 basis-[60%] sm:basis-auto"><div className="truncate text-sm font-semibold">{studioMode === "image" ? "Image generation" : activeConversation?.title || "New AI conversation"}</div><div className="mt-1 truncate text-[10px] text-muted-foreground">{settings.customerId ? data.customers.find((item) => item.id === settings.customerId)?.name : "Company-wide"} · {settings.mode} mode</div></div>
          <div className="order-last flex w-full rounded-lg border bg-white p-1 sm:order-none sm:w-auto"><button onClick={() => setStudioMode("chat")} className={cn("flex-1 rounded-md px-3 py-1.5 text-xs sm:flex-none", studioMode === "chat" ? "bg-[#202c25] text-white" : "text-muted-foreground")}><MessageSquareText className="mr-1.5 inline h-3.5 w-3.5" />Chat</button><button onClick={() => setStudioMode("image")} className={cn("flex-1 rounded-md px-3 py-1.5 text-xs sm:flex-none", studioMode === "image" ? "bg-[#202c25] text-white" : "text-muted-foreground")}><ImageIcon className="mr-1.5 inline h-3.5 w-3.5" />Image</button></div>
          <Button variant="outline" size="icon" className="bg-white xl:hidden" onClick={() => setShowSettings(true)} aria-label="Settings"><Settings2 className="h-4 w-4" /></Button>
          {activeId && <Button variant="ghost" size="icon" onClick={archive} aria-label="Archive"><Archive className="h-4 w-4" /></Button>}
        </div>

        {studioMode === "chat" ? <>
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            {!messages.length && !loading && <Welcome templates={data.templates.slice(0, 4)} onSelect={applyTemplate} />}
            <div className="mx-auto max-w-4xl space-y-5">{messages.map((message) => <ChatMessage key={message.id} message={message} onSave={() => saveMessage(message)} onFeedback={(value) => feedback(message.id, value)} />)}{sending && <div className="flex items-center gap-3 text-sm text-muted-foreground"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#202c25] text-white"><Bot className="h-4 w-4" /></div><Loader2 className="h-4 w-4 animate-spin" />ai-nonymauz-cloud is working…</div>}<div ref={bottomRef} /></div>
          </div>
          <div className="border-t bg-white/80 p-3 sm:p-4"><div className="mx-auto max-w-4xl"><div className="rounded-2xl border bg-white p-2 shadow-sm focus-within:border-[#ba5c42]/60 focus-within:ring-4 focus-within:ring-[#ba5c42]/10"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} className="min-h-20 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none" placeholder="Ask about Kretivco, a client, current web information, or generate work…" /><div className="flex flex-wrap items-center gap-2 px-1"><ContextChip icon={Database} active={settings.useCompanyData} label="KretivOS" /><ContextChip icon={Library} active={settings.useCloudRag} label="Cloud RAG" /><ContextChip icon={Globe2} active={settings.useTools} label="Tools" /><span className="ml-auto text-[10px] text-muted-foreground">Enter to send · Shift+Enter for new line</span><Button onClick={send} disabled={!prompt.trim() || sending}><Send className="h-4 w-4" />Send</Button></div></div></div></div>
        </> : <ImageStudio status={status} prompt={imagePrompt} setPrompt={setImagePrompt} style={imageStyle} setStyle={setImageStyle} image={generatedImage} loading={generatingImage} onGenerate={generateImage} />}
      </section>

      <SettingsPanel className={cn(showSettings ? "fixed inset-0 z-[160] block overflow-y-auto bg-[#f7f4ed]" : "hidden", "xl:static xl:block")} settings={settings} setSettings={setSettings} status={status} customers={data.customers} onClose={() => setShowSettings(false)} />
    </div>
  </WorkspacePage>;
}

function ServiceBadge({ status }: { status: Status }) {
  return <div className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs", status.online ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}><Circle className={cn("h-2.5 w-2.5 fill-current", status.online && "animate-pulse")} />{status.online ? `Render online · ${status.latencyMs || 0}ms` : "Render offline"}</div>;
}
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-white/75 px-3 py-3"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>; }
function EmptyDark({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-xs leading-5 text-white/35">{text}</div>; }
function ContextChip({ icon: Icon, active, label }: { icon: any; active: boolean; label: string }) { return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium", active ? "bg-emerald-50 text-emerald-700" : "bg-[#eeeae0] text-muted-foreground")}><Icon className="h-3 w-3" />{label}</span>; }

function Welcome({ templates, onSelect }: { templates: Template[]; onSelect: (template: Template) => void }) {
  return <div className="mx-auto flex max-w-3xl flex-col justify-center py-6 sm:min-h-[420px] sm:py-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#202c25] text-white"><Sparkles className="h-5 w-5" /></div><h2 className="mt-5 text-2xl font-semibold tracking-tight">What should Kretiv AI work on?</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Choose a proven workflow or start with your own request. Context and tools are controlled from the settings panel.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{templates.map((template) => <button key={template.id} onClick={() => onSelect(template)} className="rounded-xl border bg-white p-4 text-left transition hover:border-[#ba5c42]/50 hover:bg-[#fffaf6]"><div className="flex items-center gap-2 text-sm font-semibold"><WandSparkles className="h-4 w-4 text-[#ba5c42]" />{template.name}</div><div className="mt-2 text-xs leading-5 text-muted-foreground">{template.description}</div></button>)}</div></div>;
}

function ChatMessage({ message, onSave, onFeedback }: { message: Message; onSave: () => void; onFeedback: (value: "up" | "down") => void }) {
  if (message.role === "user") return <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#202c25] px-4 py-3 text-sm leading-6 text-white sm:max-w-[75%]">{message.content}</div>;
  return <div className="group flex items-start gap-3"><div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#202c25] text-white"><Bot className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="rounded-2xl border bg-white p-4 sm:p-5"><MarkdownPreview content={message.content} />{message.sources.length > 0 && <div className="mt-5 border-t pt-4"><div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">KretivOS sources</div><div className="flex flex-wrap gap-2">{message.sources.map((source) => <a key={`${message.id}-${source.index}`} href={`/knowledge?id=${encodeURIComponent(source.id)}`} className="rounded-lg border bg-[#faf8f3] px-2.5 py-2 text-[10px] hover:bg-white"><span className="font-semibold text-[#ba5c42]">[{source.index}]</span> {source.title}</a>)}</div></div>}</div><div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground"><span>{message.model || message.mode}</span>{message.usage?.total_tokens ? <span>· {compact(message.usage.total_tokens)} tokens</span> : null}<div className="ml-auto flex gap-1"><button onClick={() => navigator.clipboard.writeText(message.content)} className="rounded-lg p-2 hover:bg-black/5" title="Copy"><Copy className="h-3.5 w-3.5" /></button><button onClick={onSave} className="rounded-lg p-2 hover:bg-black/5" aria-label="Save"><Save className="h-3.5 w-3.5" /></button><button onClick={() => onFeedback("up")} className={cn("rounded-lg p-2 hover:bg-black/5", message.feedback === "up" && "bg-emerald-50 text-emerald-700")}><ThumbsUp className="h-3.5 w-3.5" /></button><button onClick={() => onFeedback("down")} className={cn("rounded-lg p-2 hover:bg-black/5", message.feedback === "down" && "bg-red-50 text-red-700")}><ThumbsDown className="h-3.5 w-3.5" /></button></div></div></div></div>;
}

function SettingsPanel({ className, settings, setSettings, status, customers, onClose }: { className?: string; settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>>; status: Status; customers: { id: string; name: string }[]; onClose: () => void }) {
  return <aside className={cn("border-l bg-[#fbfaf7] p-4", className)}><div className="flex items-center justify-between"><div><div className="text-sm font-semibold">AI configuration</div><div className="mt-1 text-[10px] text-muted-foreground">Per-conversation controls</div></div><button className="xl:hidden" onClick={onClose}><X className="h-5 w-5" /></button></div>
    <div className="mt-6 space-y-6">
      <Field label="Client context"><Select value={settings.customerId} onChange={(event) => setSettings((current) => ({ ...current, customerId: event.target.value }))} ><option value="">Company-wide</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></Field>
      <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reasoning mode</div><div className="space-y-2">{modes.map((mode) => <button key={mode.id} onClick={() => setSettings((current) => ({ ...current, mode: mode.id }))} className={cn("flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left", settings.mode === mode.id ? "border-[#ba5c42] bg-[#fff8f4]" : "bg-white")}><span className="text-sm font-medium">{mode.label}</span><span className="text-[10px] text-muted-foreground">{mode.note}</span></button>)}</div></div>
      <Field label="Model"><Select value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} ><option value="">Auto-route by mode</option>{status.models.map((model) => <option key={model} value={model}>{model.replace("ai-nonymauz-", "")}</option>)}</Select></Field>
      <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Context and tools</div><div className="space-y-2"><Toggle icon={Database} label="Live KretivOS records" note="CRM, cash, delivery and knowledge" checked={settings.useCompanyData} onChange={(checked) => setSettings((current) => ({ ...current, useCompanyData: checked }))} /><Toggle icon={Library} label="Cloud RAG" note={`${Number(status.health?.knowledge_chunks || 0)} deployed knowledge chunks`} checked={settings.useCloudRag} onChange={(checked) => setSettings((current) => ({ ...current, useCloudRag: checked }))} /><Toggle icon={Globe2} label="Web and tools" note="Current search and weather context" checked={settings.useTools} onChange={(checked) => setSettings((current) => ({ ...current, useTools: checked }))} /></div></div>
      {settings.useTools && <Field label="Default city"><Input value={settings.city} onChange={(event) => setSettings((current) => ({ ...current, city: event.target.value }))} placeholder="Kuala Lumpur" /></Field>}
      <div className="rounded-xl border bg-white p-3 text-[10px] leading-5 text-muted-foreground"><div className="flex items-center gap-2 font-semibold text-[#202c25]"><Circle className={cn("h-2 w-2 fill-current", status.online ? "text-emerald-500" : "text-red-500")} />ai-nonymauz-cloud</div><div className="mt-1 break-all">{status.origin || "Render service"}</div><div className="mt-2">BM25: {status.health?.bm25_rag_enabled ? "on" : "off"} · Vector embeddings: {status.health?.embedding_rag_enabled ? "on" : "off"} · Web search: {status.health?.web_search_enabled ? "on" : "off"}</div></div>
    </div>
  </aside>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <Label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}<div className="mt-2 normal-case tracking-normal">{children}</div></Label>; }
function Toggle({ icon: Icon, label, note, checked, onChange }: { icon: any; label: string; note: string; checked: boolean; onChange: (value: boolean) => void }) { return <button onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left"><div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", checked ? "bg-[#202c25] text-white" : "bg-[#eeeae0] text-muted-foreground")}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-xs font-medium">{label}</div><div className="mt-0.5 truncate text-[9px] text-muted-foreground">{note}</div></div><div className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition", checked ? "justify-end bg-emerald-500" : "justify-start bg-[#d8d3c9]")}><span className="h-4 w-4 rounded-full bg-white shadow" /></div></button>; }

function ImageStudio({ status, prompt, setPrompt, style, setStyle, image, loading, onGenerate }: { status: Status; prompt: string; setPrompt: (value: string) => void; style: string; setStyle: (value: string) => void; image: { dataUrl: string; promptUsed: string; model: string; usageToday: number; dailyLimit: number } | null; loading: boolean; onGenerate: () => void }) {
  const styles = status.image?.styles?.length ? status.image.styles : ["realistic", "product", "poster", "logo", "ui", "infographic", "cinematic"];
  return <div className="grid flex-1 gap-5 overflow-y-auto p-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:p-6"><div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#ba5c42]">Pollinations Flux</div><h2 className="mt-2 text-2xl font-semibold">Generate an image</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Uses the image endpoint already deployed inside ai-nonymauz-cloud. The generated file can be downloaded directly.</p><label className="mt-6 block text-xs font-medium">Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-2 min-h-44 w-full resize-y rounded-xl border bg-white p-4 text-sm leading-6 outline-none focus:border-[#ba5c42]/60 focus:ring-4 focus:ring-[#ba5c42]/10" placeholder="Describe the exact visual, composition, lighting, subject and aspect intent…" /></label><div className="mt-4"><div className="text-xs font-medium">Style</div><div className="mt-2 flex flex-wrap gap-2">{styles.map((item) => <button key={item} onClick={() => setStyle(item)} className={cn("rounded-lg border px-3 py-2 text-xs capitalize", style === item ? "border-[#202c25] bg-[#202c25] text-white" : "bg-white")}>{item}</button>)}</div></div><Button className="mt-5 w-full" onClick={onGenerate} disabled={!prompt.trim() || loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{loading ? "Generating…" : "Generate image"}</Button></div><div className="flex min-h-[430px] items-center justify-center rounded-2xl border bg-white p-3">{image ? <div className="w-full"><img src={image.dataUrl} alt={image.promptUsed} className="mx-auto max-h-[650px] w-full rounded-xl object-contain" /><div className="mt-3 flex items-center gap-2"><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{image.model}</div><div className="mt-1 text-[10px] text-muted-foreground">Daily usage {image.usageToday}/{image.dailyLimit}</div></div><Button variant="outline" asChild><a href={image.dataUrl} download={`kretivos-${Date.now()}.png`}><Download className="h-4 w-4" />Download</a></Button></div></div> : <div className="max-w-sm text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eeeae0]"><ImageIcon className="h-6 w-6 text-[#ba5c42]" /></div><div className="mt-4 font-semibold">Your generated visual appears here</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Current service limit: {status.image?.daily_limit || 20} images per day.</p></div>}</div></div>;
}
