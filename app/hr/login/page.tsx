"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Status = { configured: boolean; setupAvailable: boolean; migrationRequired?: boolean; error?: string };

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function HRLoginPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    jsonRequest("/api/hr/auth/status", { cache: "no-store" })
      .then((data) => {
        if (data.session) { window.location.replace("/hr"); return; }
        setStatus(data);
      })
      .catch((value) => setError(value instanceof Error ? value.message : "Unable to load HRMS login."));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!status) return;
    setBusy(true); setError("");
    try {
      if (status.configured) {
        await jsonRequest("/api/hr/auth/login", { method: "POST", body: JSON.stringify({ identifier, pin }) });
      } else {
        await jsonRequest("/api/hr/auth/setup", { method: "POST", body: JSON.stringify({ name, email, pin, setupKey }) });
      }
      window.location.replace("/hr");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  const setup = status && !status.configured;
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:flex sm:items-center sm:justify-center">
    <div className="w-full max-w-lg">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to KretivOS</Link>
      <Card className="overflow-hidden border-black/8 bg-white/90 shadow-xl">
        <div className="bg-foreground p-6 text-white sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><UsersRound className="h-5 w-5" /></div><div className="mt-6 text-[10px] font-semibold uppercase tracking-[.2em] text-accent-muted">Kretivco people operations</div><h1 className="mt-2 text-3xl font-semibold">{setup ? "Set up HRMS" : "Sign in to HRMS"}</h1><p className="mt-2 text-sm leading-6 text-white/55">{setup ? "Claim the first HR administrator account. This can only be completed once." : "Use your work email or team name and private PIN."}</p></div>
        <CardContent className="p-5 sm:p-8">
          {!status && !error && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking HRMS security…</div>}
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {status && <form onSubmit={submit} className="space-y-4">
            {setup ? <>
              <Field label="Your name"><Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></Field>
              <Field label="Work email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></Field>
              <Field label="One-time setup key"><Input type="password" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} autoComplete="one-time-code" required /></Field>
              {!status.setupAvailable && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Add <code>HRMS_SETUP_KEY</code> in Vercel and local environment before claiming the first administrator.</div>}
            </> : <Field label="Work email or team name"><Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /></Field>}
            <Field label={setup ? "Create PIN" : "PIN"}><Input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete={setup ? "new-password" : "current-password"} minLength={6} required /></Field>
            <Button className="h-12 w-full" disabled={busy || Boolean(setup && !status.setupAvailable)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : setup ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}{busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}</Button>
          </form>}
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-background p-4 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Sessions use an HTTP-only cookie. PIN hashes and session tokens are never returned to the browser.</div>
        </CardContent>
      </Card>
    </div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <Label className="block text-foreground-soft"><span>{label}</span><span className="mt-2 block">{children}</span></Label>;
}
