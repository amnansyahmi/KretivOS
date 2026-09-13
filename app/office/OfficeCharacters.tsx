"use client";

import { memo, useEffect, useRef } from "react";
import type { OfficeWorldAgent } from "./OfficeWorld";
import { CORE_STATIONS, STATE_LABELS, sceneState } from "@/lib/office-scene";
import { ACTIVITY_LABELS, createWalker, stepWalker, seatedActivity, type Walker } from "@/lib/office-motion";
import { WorkstationArt } from "./OfficeDioramaArt";
import styles from "./office-diorama.module.css";

type Props = { agents: OfficeWorldAgent[]; enabled: boolean; parked?: boolean; hasPlan: boolean; missionActive: boolean; onSelect?: (agent: OfficeWorldAgent) => void };
export default memo(function OfficeCharacters({ agents, enabled, parked = false, hasPlan, missionActive, onSelect }: Props) {
  const people = useRef<Walker[]>(CORE_STATIONS.map((s, i) => createWalker(s.id, i)));
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef({ agents, hasPlan, missionActive });
  useEffect(() => { latest.current = { agents, hasPlan, missionActive }; }, [agents, hasPlan, missionActive]);
  useEffect(() => {
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    const canHover = window.matchMedia("(hover: hover)").matches;
    const parent = nodes.current.values().next().value?.parentElement;
    let scale = (parent?.clientWidth || 1000) / 1000;
    const resize = new ResizeObserver(() => {
      scale = (parent?.clientWidth || 1000) / 1000;
      people.current.forEach(paint);
    });
    const paint = (p: Walker) => {
      const node = nodes.current.get(p.id);
      if (!node) return;
      node.style.left = "0"; node.style.top = "0";
      node.style.transform = `translate(${p.x * scale}px, ${p.y * scale}px) translate(-50%, -100%)`;
      node.style.zIndex = String(10 + Math.round(p.y));
      node.style.setProperty("--facing", String(p.facing));
      node.dataset.activity = p.activity;
      node.dataset.seated = String(seatedActivity(p.activity));
      node.dataset.cup = String(p.carryingCup);
      node.dataset.back = String(p.activity === "makingCoffee" || p.activity === "lounge");
      const label = node.querySelector<HTMLElement>("[data-activity-label]");
      const copy = ACTIVITY_LABELS[p.activity];
      if (label && label.textContent !== copy) label.textContent = copy;
    };
    if (parent) resize.observe(parent);
    if (!enabled) {
      if (parked) {
        people.current = people.current.map((p, i) => createWalker(p.id, i));
        if (parent) { parent.dataset.tv = "false"; parent.dataset.brewing = "false"; }
      }
      people.current.forEach(paint);
      return () => resize.disconnect();
    }
    const tick = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, .1) : 0;
      previous = now; elapsed += delta;
      if (elapsed >= 1 / 30) {
        const occupied = new Set(people.current.map(p => p.destination));
        people.current = people.current.map(p => {
          const agent = latest.current.agents.find(a => a.id === p.id);
          if (!agent) return p;
          const node = nodes.current.get(p.id);
          if (node?.matches(":focus-visible") || (canHover && node?.matches(":hover"))) return p;
          const next = stepWalker(p, agent.status, elapsed, occupied, Math.random, latest.current.hasPlan, latest.current.missionActive);
          occupied.add(next.destination); paint(next); return next;
        });
        if (parent) {
          parent.dataset.tv = String(people.current.some(p => p.activity === "lounge"));
          parent.dataset.brewing = String(people.current.some(p => p.activity === "makingCoffee"));
        }
        elapsed = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
  }, [enabled, parked]);

  return <>{CORE_STATIONS.map((station, index) => {
    const agent = agents.find(a => a.id === station.id);
    if (!agent) return null;
    const state = sceneState(agent, hasPlan);
    const initial = createWalker(agent.id, index);
    return <button key={agent.id} type="button" ref={node => { if (node) nodes.current.set(agent.id, node); else nodes.current.delete(agent.id); }}
      className={styles.character} data-agent={agent.id} data-state={state} data-activity="idle" data-seated="true"
      style={{ left: `${initial.x / 10}%`, top: `${initial.y / 7.5}%` }}
      aria-label={`${agent.name}, ${STATE_LABELS[state]}. Open agent details.`} aria-haspopup="dialog"
      disabled={!onSelect} onClick={() => onSelect?.(agent)}>
      <WorkstationArt agentId={agent.id} />
      <span className={styles.characterCaption} aria-hidden="true"><b>{agent.name}</b><span data-activity-label>Available</span></span>
    </button>;
  })}</>;
});
