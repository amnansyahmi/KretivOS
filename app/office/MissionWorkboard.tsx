"use client";

import { useState } from "react";
import Link from "next/link";
import OfficeRichText from "@/components/office-rich-text";
import { taskPresentation, type TaskRuns } from "@/lib/office-task-state";
import type { SceneAgent, SceneTask } from "@/lib/office-scene";
import styles from "./mission-workboard.module.css";

type Task = SceneTask & { title: string; instruction?: string };
type Props = {
  title: string; summary?: string; tasks: Task[]; runs: TaskRuns;
  agents: (SceneAgent & { name: string })[]; status: string;
  final: string; error?: string; missionId: string | null; quality?: number;
  onSelectAgent: (id: string) => void; onOpenActions: () => void;
};

export default function MissionWorkboard({ title, summary, tasks, runs, agents, status, final, error, missionId, quality, onSelectAgent, onOpenActions }: Props) {
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState("");
  const completed = tasks.filter(t => runs[t.id]?.status === "completed").length;
  const attention = tasks.filter(t => ["failed", "blocked"].includes(runs[t.id]?.status));
  const active = tasks.filter(t => runs[t.id]?.status === "working").length;
  const shown = tasks.filter(t => filter === "all" || (filter === "attention" ? ["failed", "blocked"].includes(runs[t.id]?.status) : (runs[t.id]?.status || "queued") === filter));
  const name = (id: string) => agents.find(a => a.id === id)?.name || id;
  const qa = agents.find(a => a.id === "qa");
  async function copyResult() {
    try { await navigator.clipboard.writeText(final); setCopied("Result copied."); }
    catch { setCopied("Could not copy. Select and copy the result text below."); }
  }

  return <section className={styles.board} aria-label="Mission execution board">
    <header className={styles.heading}><div><span className={styles.eyebrow}>MISSION / EXECUTION</span><h2>{title || "Your next mission"}</h2></div><span className={styles.status} role="status">{status}</span></header>
    {summary && <p className={styles.summary}>{summary}</p>}
    <div className={styles.metrics}><span><b>{completed}/{tasks.length}</b> tasks complete</span><span><b>{active}</b> working</span><span><b>{attention.length}</b> blocked / failed</span></div>
    {tasks.length > 0 && <progress className={styles.progress} value={completed} max={tasks.length} aria-label="Completed specialist tasks" />}
    <p className={styles.hint}>Task completion is separate from QA, final delivery and your approval.</p>
    {error && <div className={styles.warning} role="alert">{error}{missionId && <Link href={`/office/missions/${missionId}`}>Check saved mission state →</Link>}</div>}
    {status === "Waiting for input" && <button type="button" className={styles.warning} onClick={onOpenActions}>Mission paused. Provide the missing input in Actions →</button>}
    <nav className={styles.filters} aria-label="Filter mission tasks">{[["all", "All tasks"], ["working", "Working"], ["queued", "Queued"], ["attention", "Attention"], ["completed", "Completed"]].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</nav>
    <ol className={styles.tasks}>{shown.map(task => {
      const presentation = taskPresentation(task, runs);
      const run = runs[task.id];
      return <li key={task.id} data-status={presentation.status}>
        <div className={styles.taskHeader}><div><span className={styles.taskId}>{task.id}</span><h3>{task.title}</h3></div><span className={styles.taskStatus}>{presentation.label}</span></div>
        <button className={styles.owner} type="button" onClick={() => onSelectAgent(task.agent)}>{name(task.agent)} · View agent →</button>
        {task.dependsOn.length > 0 && <div className={styles.dependencies}><span>Depends on</span>{task.dependsOn.map(id => <span key={id} data-complete={runs[id]?.status === "completed"}>{runs[id]?.status === "completed" ? "✓ " : "○ "}{tasks.find(t => t.id === id)?.title || id}</span>)}</div>}
        {run?.detail && run.detail !== task.title && <p className={styles.hint}>{run.detail}</p>}
        <details className={styles.taskDetails}><summary>Instructions{run?.output ? " & latest output" : ""}</summary>{task.instruction && <p>{task.instruction}</p>}{run?.output ? <OfficeRichText content={run.output} /> : <p>No output received for this task yet.</p>}</details>
      </li>;
    })}</ol>
    {!shown.length && <p className={styles.empty}>{tasks.length ? "No tasks in this view." : status === "In progress" ? "Chief is preparing the plan. Individual tasks will appear as soon as they are assigned." : "Start a mission to see its task plan, dependencies and outputs here."}</p>}
    <div className={styles.deliveryStages}><div><span>QUALITY REVIEW</span><strong>{qa?.status === "working" ? "QA is reviewing" : qa?.status === "completed" ? "QA review received" : ["failed", "blocked"].includes(qa?.status || "") ? "QA needs attention" : "Awaiting specialist work"}</strong></div><div><span>FINAL DELIVERY</span><strong>{final ? "Result available" : status === "Failed" ? "Not completed" : "Awaiting Chief synthesis"}</strong></div></div>
    {final ? <section className={styles.result} aria-label="Mission result"><div className={styles.resultHeader}><div><span className={styles.eyebrow}>CHIEF / FINAL RESULT</span><h3>Decision-ready delivery</h3></div>{typeof quality === "number" && <span>Quality {quality}/100</span>}</div><OfficeRichText content={final} tone="light" /><div className={styles.resultActions}><button type="button" onClick={() => void copyResult()}>Copy result</button>{missionId && <Link href={`/office/missions/${missionId}`}>Saved outputs & revisions →</Link>}<button type="button" onClick={onOpenActions}>Review approvals →</button></div><p role="status">{copied}</p></section> : <div className={styles.empty}>The final result will appear here after review and synthesis. No completion is inferred from elapsed time.</div>}
  </section>;
}
