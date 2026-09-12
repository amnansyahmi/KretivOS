"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Archive, Bell, ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import type { OfficeWorldAgent } from "./OfficeWorld";
import { CORE_STATIONS, STATE_LABELS, sceneConnections, scenePhase, sceneState, type SceneTask } from "@/lib/office-scene";
import { RoomArt, WorkstationArt } from "./OfficeDioramaArt";
import styles from "./office-diorama.module.css";

type Props = {
  agents: OfficeWorldAgent[];
  motion?: boolean;
  missionTitle?: string;
  missionStatus?: string;
  artifactCount?: number;
  approvalCount?: number;
  attentionCount?: number;
  memoryCount?: number;
  tasks?: SceneTask[];
  hasPlan?: boolean;
  onSelectAgent?: (agent: OfficeWorldAgent) => void;
  onOpenMission?: () => void;
  onOpenArchive?: () => void;
  onOpenNotice?: () => void;
};

const zones = [
  { name: "Command", x: 495, caption: "Mission control" },
  { name: "Strategy", x: 265, caption: "Research & insight" },
  { name: "Growth", x: 585, caption: "Commercial & content" },
  { name: "Quality", x: 810, caption: "Evidence & review" },
] as const;
const phaseCopy = {
  ready: "Ready for your next brief", brief: "Chief is shaping the mission",
  specialists: "Specialists are executing the plan", review: "QA is checking the deliverables",
  delivery: "Chief is assembling the final delivery", attention: "Your team needs attention",
  completed: "Mission complete · delivery ready",
};
const stages = ["Brief", "Specialists", "Review", "Delivery"];

export default function StrategyClassroom({
  agents, motion = true, missionTitle = "Ready for the next mission", missionStatus = "Ready",
  artifactCount = 0, approvalCount = 0, attentionCount = 0, memoryCount = 0,
  tasks = [], hasPlan = false, onSelectAgent, onOpenMission, onOpenArchive, onOpenNotice,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const cameraTarget = useRef(495);
  const inView = useRef(true);
  const [zone, setZone] = useState("Command");
  const [selected, setSelected] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(true);
  const phase = scenePhase(agents, hasPlan, missionStatus);
  const connections = useMemo(() => sceneConnections(agents, tasks, phase), [agents, tasks, phase]);
  const extraAgents = agents.filter(a => !CORE_STATIONS.some(s => s.id === a.id));
  const workingCount = agents.filter(a => a.status === "working").length;
  const phaseIndex = ["brief", "specialists", "review", "delivery"].indexOf(phase);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(preference.matches);
    sync(); preference.addEventListener("change", sync);
    const updateVisibility = () => setVisible(inView.current && !document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => { preference.removeEventListener("change", sync); document.removeEventListener("visibilitychange", updateVisibility); };
  }, []);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting;
      setVisible(entry.isIntersecting && !document.hidden);
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  function panTo(x: number, smooth = true) {
    cameraTarget.current = x;
    if (!viewport.current || !scene.current) return;
    const width = scene.current.clientWidth;
    viewport.current.scrollTo({ left: width * x / 1000 - viewport.current.clientWidth / 2, behavior: smooth && motion && !reducedMotion ? "smooth" : "instant" });
  }

  useEffect(() => {
    // Keep the chosen zone centred across rotations/resizes, without zooming labels.
    const observer = new ResizeObserver(() => panTo(cameraTarget.current, false));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
    // panTo reads current DOM dimensions, not React layout state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, reducedMotion]);

  function focusZone(name: string, x: number) { setZone(name); panTo(x); }

  return <section className={styles.office} data-motion={motion && !reducedMotion && visible ? "on" : "off"} aria-label="Interactive AI office">
    <div className={styles.toolbar}>
      <div><span className={styles.eyebrow}>KRETIVOS / LIVE WORKSPACE</span><h3>The strategy floor<span className={styles.liveDot} /></h3></div>
      <span className={styles.occupancy}>{workingCount ? `${workingCount} working` : "Team on standby"}</span>
    </div>

    <nav className={styles.zones} aria-label="Focus office zone">
      {zones.map(z => <button key={z.name} type="button" aria-pressed={zone === z.name} onClick={() => focusZone(z.name, z.x)}><span>{z.name}</span><small>{z.caption}</small></button>)}
    </nav>

    <div className={styles.viewport} ref={viewport} aria-label="Office panorama. Swipe horizontally or use zone controls to explore.">
      <div ref={scene} className={styles.scene}>
        <RoomArt />
        <svg className={styles.connections} viewBox="0 0 1000 780" aria-hidden="true" focusable="false">
          {connections.map(({ from, to }) => {
            const start = CORE_STATIONS.find(s => s.id === from)!;
            const end = CORE_STATIONS.find(s => s.id === to)!;
            const path = `M${start.x} ${start.y + 35}Q${start.x} ${end.y + 65} ${end.x} ${end.y + 35}`;
            return <g key={`${from}-${to}`}><path d={path} className={styles.connectionTrack} /><path d={path} className={styles.connectionPulse} /></g>;
          })}
        </svg>

        <button type="button" onClick={onOpenArchive} disabled={!onOpenArchive} className={`${styles.wallDisplay} ${styles.archive}`} aria-label={`Open archive: ${memoryCount} missions remembered`}>
          <span className={styles.displayLabel}><Archive size={14} /> Archive</span><strong>{memoryCount}<small>missions</small></strong>
          <span className={styles.books} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} />)}</span>
        </button>
        <button type="button" onClick={onOpenMission} disabled={!onOpenMission} className={`${styles.wallDisplay} ${styles.missionBoard}`} data-active={phase !== "ready"} aria-label={`Open mission: ${missionTitle}. ${missionStatus}. ${artifactCount} deliverables.`}>
          <span className={styles.displayLabel}>Mission control <ArrowRight size={14} /></span>
          <strong>{missionTitle || "Ready for the next mission"}</strong>
          <span className={styles.missionMeta}>{missionStatus}<span>{artifactCount} deliverables</span></span>
          <span className={styles.boardBars} aria-hidden="true">{stages.map((s, i) => <i key={s} data-lit={phase === "completed" || (phaseIndex >= 0 && i <= phaseIndex)} />)}</span>
        </button>
        <button type="button" onClick={onOpenNotice} disabled={!onOpenNotice} className={`${styles.wallDisplay} ${styles.actions}`} aria-label={`Open actions: ${approvalCount} approvals, ${attentionCount} need attention`}>
          <span className={styles.displayLabel}><Bell size={14} /> Actions</span>
          <span>Approve <b>{approvalCount}</b></span><span>Attention <b>{attentionCount}</b></span>
        </button>

        {CORE_STATIONS.map(station => {
          const agent = agents.find(a => a.id === station.id);
          if (!agent) return null;
          const state = sceneState(agent, hasPlan);
          return <button type="button" key={agent.id} className={styles.station} data-state={state} data-agent={agent.id} data-selected={selected === agent.id} aria-label={`${agent.name}, ${STATE_LABELS[state]}. Open agent details.`} aria-haspopup="dialog" disabled={!onSelectAgent}
            style={{ left: `${station.x / 10}%`, top: `${(station.y - 112) / 7.8}%` }}
            onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) { setSelected(agent.id); setZone(station.zone); panTo(station.x); } }}
            onClick={() => { setSelected(agent.id); setZone(station.zone); panTo(station.x); onSelectAgent?.(agent); }}>
            <WorkstationArt agentId={agent.id} active={["thinking", "working", "reviewing"].includes(state)} />
            <span className={styles.agentName}>{agent.name}</span>
            <span className={styles.agentStatus}><i />{STATE_LABELS[state]}</span>
          </button>;
        })}
        <span className={`${styles.floorLabel} ${styles.strategyLabel}`}>01 / STRATEGY</span>
        <span className={`${styles.floorLabel} ${styles.growthLabel}`}>02 / GROWTH</span>
        <span className={`${styles.floorLabel} ${styles.qualityLabel}`}>03 / QUALITY</span>
      </div>
    </div>

    <div className={styles.panControls}>
      <button type="button" aria-label="Pan office left" onClick={() => viewport.current?.scrollBy({ left: -230, behavior: motion && !reducedMotion ? "smooth" : "instant" })}><ChevronLeft size={18} /></button>
      <span>Swipe to explore · tap an agent</span>
      <button type="button" aria-label="Centre on Chief" onClick={() => focusZone("Command", 495)}><Crosshair size={18} /></button>
      <button type="button" aria-label="Pan office right" onClick={() => viewport.current?.scrollBy({ left: 230, behavior: motion && !reducedMotion ? "smooth" : "instant" })}><ChevronRight size={18} /></button>
    </div>

    <div className={styles.missionFlow}>
      <p role="status" aria-live="polite"><span className={styles.liveDot} />{phaseCopy[phase]}</p>
      <ol aria-label="Mission stages">{stages.map((stage, i) => <li key={stage} data-current={i === phaseIndex} data-done={phase === "completed" || (phaseIndex >= 0 && i < phaseIndex)} aria-current={i === phaseIndex ? "step" : undefined}><span>{phase === "completed" || (phaseIndex >= 0 && i < phaseIndex) ? "✓" : `0${i + 1}`}</span>{stage}</li>)}</ol>
      <div className={styles.quickActions}>
        <button type="button" onClick={onOpenMission} disabled={!onOpenMission}>Mission board <ArrowRight size={14} /></button>
        <button type="button" onClick={onOpenArchive} disabled={!onOpenArchive}>Archive · {memoryCount}</button>
        <button type="button" onClick={onOpenNotice} disabled={!onOpenNotice}>Actions · {approvalCount + attentionCount}</button>
      </div>
    </div>

    {extraAgents.length > 0 && <details className={styles.specialists}>
      <summary>Extended team <span>{extraAgents.length} specialists</span></summary>
      <div>{extraAgents.map(agent => <button type="button" key={agent.id} data-state={sceneState(agent, hasPlan)} aria-haspopup="dialog" onClick={() => onSelectAgent?.(agent)} disabled={!onSelectAgent}><span>{agent.name}</span><small>{STATE_LABELS[sceneState(agent, hasPlan)]}</small></button>)}</div>
    </details>}
  </section>;
}
