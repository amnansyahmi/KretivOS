"use client";

import { useMemo } from "react";
import type { OfficeAgentStatus, OfficeWorldAgent } from "./OfficeWorld";

type Props = {
  agents: OfficeWorldAgent[];
  motion?: boolean;
  missionTitle?: string;
  missionStatus?: string;
  artifactCount?: number;
  approvalCount?: number;
  attentionCount?: number;
  memoryCount?: number;
  onSelectAgent?: (agent: OfficeWorldAgent) => void;
  onOpenMission?: () => void;
  onOpenArchive?: () => void;
  onOpenNotice?: () => void;
};

const defaults = ["research", "business", "sales", "pricing", "marketing", "qa"];

function priority(status: OfficeAgentStatus) {
  if (status === "working") return 0;
  if (status === "blocked" || status === "failed") return 1;
  if (status === "queued") return 2;
  if (status === "completed") return 3;
  return 4;
}

function dot(status: OfficeAgentStatus) {
  if (status === "working") return "bg-[#d9ff62] shadow-[0_0_12px_rgba(217,255,98,.55)]";
  if (status === "completed") return "bg-emerald-400";
  if (status === "blocked" || status === "failed") return "bg-amber-400";
  if (status === "queued") return "bg-sky-400";
  return "bg-white/20";
}

function statusText(status: OfficeAgentStatus) {
  return status === "working" ? "Working" : status === "completed" ? "Done" : status === "queued" ? "Queued" : status === "blocked" ? "Attention" : status === "failed" ? "Failed" : "Standby";
}

export default function StrategyClassroom({
  agents,
  motion = true,
  missionTitle = "Ready for the next mission",
  missionStatus = "Ready",
  artifactCount = 0,
  approvalCount = 0,
  attentionCount = 0,
  memoryCount = 0,
  onSelectAgent,
  onOpenMission,
  onOpenArchive,
  onOpenNotice,
}: Props) {
  const chief = agents.find((agent) => agent.id === "chief");
  const specialists = useMemo(() => {
    const active = agents
      .filter((agent) => agent.id !== "chief" && agent.status !== "standby")
      .sort((a, b) => priority(a.status) - priority(b.status));
    const picked = [...active];
    for (const id of defaults) {
      if (picked.length >= 6) break;
      const agent = agents.find((item) => item.id === id);
      if (agent && !picked.some((item) => item.id === agent.id)) picked.push(agent);
    }
    return picked.slice(0, 6);
  }, [agents]);

  return (
    <div className="relative w-full overflow-hidden rounded-[26px] border border-white/[.07] bg-[#0d120e] shadow-[0_30px_75px_rgba(0,0,0,.3)]">
      <div className="relative border-b border-white/[.05] bg-[linear-gradient(180deg,#171d18_0%,#111612_100%)] px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
        <div className="grid grid-cols-[64px_minmax(0,1fr)_72px] items-start gap-2 sm:grid-cols-[92px_minmax(0,1fr)_102px] sm:gap-4">
          <button onClick={onOpenArchive} className="min-w-0 rounded-xl border border-white/[.06] bg-black/20 p-2 text-left transition hover:bg-white/[.03] sm:p-3">
            <div className="text-[7px] font-semibold uppercase tracking-[.14em] text-[#d9ff62]/65 sm:text-[8px]">Archive</div>
            <div className="mt-1 text-[14px] font-semibold sm:text-lg">{memoryCount}</div>
            <div className="mt-1 hidden text-[7px] text-white/24 sm:block">missions remembered</div>
            <div className="mt-2 space-y-1">
              {[0,1,2].map((row) => <div key={row} className="flex gap-0.5"><span className="h-2.5 w-1.5 rounded-[1px] bg-[#586642]" /><span className="h-3 w-1.5 rounded-[1px] bg-[#374a3d]" /><span className="h-2 w-1.5 rounded-[1px] bg-[#715f38]" /><span className="h-3.5 w-1.5 rounded-[1px] bg-[#454e63]" /></div>)}
            </div>
          </button>

          <button onClick={onOpenMission} className="min-w-0 rounded-2xl border border-[#d9ff62]/16 bg-[#0b120d] p-3 text-left shadow-[0_12px_35px_rgba(0,0,0,.22)] transition hover:border-[#d9ff62]/28 sm:p-4">
            <div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#d9ff62] sm:text-[8px]">Mission board</div>
            <div className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-4 text-white/78 sm:text-sm sm:leading-5">{missionTitle || "Ready for the next mission"}</div>
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[7px] text-white/28 sm:text-[8px]"><span>{missionStatus}</span><span>·</span><span>{artifactCount} deliverables</span></div>
          </button>

          <button onClick={onOpenNotice} className="min-w-0 rounded-xl border border-amber-300/10 bg-amber-300/[.025] p-2 text-left transition hover:bg-amber-300/[.04] sm:p-3">
            <div className="text-[7px] font-semibold uppercase tracking-[.12em] text-white/46 sm:text-[8px]">Actions</div>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between gap-1 rounded-lg bg-black/18 px-1.5 py-1.5"><span className="truncate text-[7px] text-white/28">Approve</span><span className="text-[9px] font-semibold text-[#d9ff62]">{approvalCount}</span></div>
              <div className="flex items-center justify-between gap-1 rounded-lg bg-black/18 px-1.5 py-1.5"><span className="truncate text-[7px] text-white/28">Attention</span><span className="text-[9px] font-semibold text-amber-300">{attentionCount}</span></div>
            </div>
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden px-3 pb-5 pt-4 sm:px-5 sm:pb-7 sm:pt-6">
        <div className="pointer-events-none absolute inset-x-[4%] bottom-0 top-0 [clip-path:polygon(12%_0,88%_0,100%_100%,0_100%)] bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.018)_1px,transparent_1px)] bg-[size:34px_26px] opacity-70" />
        <div className="pointer-events-none absolute inset-x-[8%] bottom-0 top-0 bg-[radial-gradient(circle_at_50%_8%,rgba(217,255,98,.045),transparent_42%)]" />

        {chief && <div className="relative z-10 mx-auto mb-5 flex max-w-[220px] justify-center sm:mb-7">
          <Desk agent={chief} featured motion={motion} onClick={() => onSelectAgent?.(chief)} />
        </div>}

        <div className="relative z-10 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-7">
          {specialists.map((agent) => <Desk key={agent.id} agent={agent} motion={motion} onClick={() => onSelectAgent?.(agent)} />)}
        </div>

        <div className="relative z-10 mt-6 grid grid-cols-3 gap-2 border-t border-white/[.045] pt-4 text-center sm:mt-8">
          <div><div className="text-[7px] uppercase tracking-[.15em] text-white/18">Strategy</div><div className="mt-1 text-[8px] text-white/30">Research & insight</div></div>
          <div><div className="text-[7px] uppercase tracking-[.15em] text-white/18">Growth</div><div className="mt-1 text-[8px] text-white/30">Commercial & content</div></div>
          <div><div className="text-[7px] uppercase tracking-[.15em] text-white/18">Quality</div><div className="mt-1 text-[8px] text-white/30">Product & review</div></div>
        </div>
      </div>

      <div className="border-t border-white/[.05] px-3 py-2.5 text-[8px] text-white/24 sm:px-5">Tap the mission board, archive shelf, action board or any specialist.</div>
    </div>
  );
}

function Desk({ agent, featured = false, motion, onClick }: { agent: OfficeWorldAgent; featured?: boolean; motion: boolean; onClick: () => void }) {
  const active = agent.status === "working";
  const important = active || agent.status === "blocked" || agent.status === "failed";
  return <button onClick={onClick} className={`group relative min-w-0 rounded-2xl px-1 pb-2 pt-1 text-center transition ${important ? "bg-white/[.018]" : "hover:bg-white/[.015]"}`}>
    <div className={`relative mx-auto ${featured ? "h-[82px] w-[150px] sm:h-[92px] sm:w-[172px]" : "h-[70px] w-[118px] max-w-full sm:h-[82px] sm:w-[142px]"}`}>
      <div className={`absolute left-1/2 top-1/2 h-[40%] w-[84%] -translate-x-1/2 -translate-y-[10%] -skew-x-[28deg] rounded-sm border ${active ? "border-[#d9ff62]/28 bg-[#465438]" : "border-white/[.07] bg-[#313933]"} shadow-[0_12px_20px_rgba(0,0,0,.28)]`} />
      <div className={`absolute left-1/2 top-[35%] h-[26%] w-[30%] -translate-x-1/2 rounded-[4px] border ${active ? "border-[#d9ff62]/35 bg-[#0a100b]" : "border-white/[.08] bg-[#090d0a]"}`}><div className={`absolute inset-[22%] rounded-[2px] ${active ? "bg-[#d9ff62]/18" : "bg-white/[.035]"}`} /></div>
      <div className={`absolute left-1/2 top-[2%] -translate-x-1/2 text-[22px] sm:text-[26px] ${motion && active ? "animate-[bounce_1.5s_ease-in-out_infinite]" : ""}`}>{agent.emoji}</div>
      <span className={`absolute left-[61%] top-[5%] h-2 w-2 rounded-full ${dot(agent.status)}`} />
      <div className="absolute bottom-[1%] left-1/2 h-[16%] w-[22%] -translate-x-1/2 rounded-t-lg border border-white/[.06] bg-[#202721]" />
    </div>
    <div className={`truncate text-[9px] font-medium sm:text-[10px] ${important ? "text-white/72" : "text-white/48"}`}>{agent.name}</div>
    <div className="mt-0.5 flex items-center justify-center gap-1 text-[7px] text-white/24"><span className={`h-1.5 w-1.5 rounded-full ${dot(agent.status)}`} />{statusText(agent.status)}</div>
  </button>;
}
