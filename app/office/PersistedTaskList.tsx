"use client";

import { useState } from "react";
import OfficeRichText from "@/components/office-rich-text";
import styles from "./mission-workboard.module.css";

type Task = { task_key: string; agent_id: string; title: string; instruction?: string; depends_on?: string[]; status: string; output?: string; stale?: boolean; retry_count?: number };
export default function PersistedTaskList({ tasks, retrying, feedback, setFeedback, onRetry }: {
  tasks: Task[]; retrying: string | null; feedback: Record<string, string>;
  setFeedback: (value: Record<string, string>) => void; onRetry: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const shown = tasks.filter(t => filter === "all" || (filter === "attention" ? t.stale || ["blocked", "failed"].includes(t.status) : t.status === filter));
  return <section className={styles.board} aria-label="Saved task workstreams">
    <div className={styles.heading}><div><span className={styles.eyebrow}>TASKS / SAVED WORK</span><h2>Specialist workstreams</h2></div><span className={styles.status}>{tasks.filter(t => t.status === "completed").length}/{tasks.length} complete</span></div>
    <nav className={styles.filters} aria-label="Filter saved tasks">{[["all", "All tasks"], ["working", "Working"], ["attention", "Attention / stale"], ["completed", "Completed"]].map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}>{label}</button>)}</nav>
    <ol className={styles.tasks}>{shown.map(task => <li key={task.task_key} data-status={task.status}>
      <div className={styles.taskHeader}><div><span className={styles.taskId}>{task.task_key} · {task.agent_id}</span><h3>{task.title}</h3></div><span className={styles.taskStatus}>{task.status.replaceAll("_", " ")}{task.retry_count ? ` · revision ${task.retry_count}` : ""}</span></div>
      {task.stale && <p className={styles.warning}>An upstream task changed. Review this output before relying on it.</p>}
      {Array.isArray(task.depends_on) && task.depends_on.length > 0 && <div className={styles.dependencies}><span>Depends on</span>{task.depends_on.map(id => <span key={id} data-complete={tasks.find(t => t.task_key === id)?.status === "completed"}>{tasks.find(t => t.task_key === id)?.title || id}</span>)}</div>}
      {task.instruction && <details className={styles.taskDetails}><summary>Task instructions</summary><p>{task.instruction}</p></details>}
      <details className={styles.taskDetails}><summary>{task.output ? "Read latest output" : "No output yet"}</summary>{task.output && <OfficeRichText content={task.output} />}</details>
      <label className={styles.search}>Revision feedback for {task.title}<input value={feedback[task.task_key] || ""} onChange={event => setFeedback({ ...feedback, [task.task_key]: event.target.value })} placeholder="What should this specialist improve?" /></label>
      <div className={styles.filters}><button type="button" onClick={() => onRetry(task.task_key)} disabled={!feedback[task.task_key]?.trim() || retrying !== null || ["working", "queued"].includes(task.status)}>{retrying === task.task_key ? "Revising…" : "Revise this task"}</button></div>
    </li>)}</ol>
    {!shown.length && <p className={styles.empty}>No saved tasks in this view.</p>}
  </section>;
}
