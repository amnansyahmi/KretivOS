import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function WorkspacePage({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f4f1e8] px-4 py-6 text-[#202820] md:px-8 md:py-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-[#5d665f] hover:text-[#202c25]">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to KretivOS
            </Link>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#ba5c42]">{eyebrow}</div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-[40px]">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#687169]">{description}</p>
          </div>
          {actions}
        </div>
        {children}
      </div>
    </main>
  );
}
