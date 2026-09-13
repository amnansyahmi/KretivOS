"use client";

import { CircleHelp } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import styles from "./office-diorama.module.css";

export const OFFICE_BRIEF_TEMPLATE = `Client / business:\nProduct or service, price and margin:\nTarget audience and location:\nGoal and deadline:\nBudget and available channels:\nFacts / evidence we already have:\nDeliverables needed (e.g. TOFU/MOFU/BOFU funnel, offers, ad copy and a 7-day action plan):\nConstraints / things that need my approval:\n\nAsk for critical missing inputs. Separate evidence from assumptions. Make the output actionable with an owner, next action and success measure.`;

export default function OfficeFlowGuide({ onPrepareBrief, onOpenMission, onOpenActions, onOpenArchive }: {
  onPrepareBrief?: () => void; onOpenMission?: () => void; onOpenActions?: () => void; onOpenArchive?: () => void;
}) {
  return <Dialog><DialogTrigger asChild><button type="button" className={styles.guideTrigger}><CircleHelp size={16} /><span>How it works</span></button></DialogTrigger>
    <DialogContent className={`${styles.agentDialog} ${styles.flowGuide}`}>
      <DialogTitle>One brief. A coordinated AI team.</DialogTitle>
      <DialogDescription>The office visualizes the mission. The task board and saved outputs tell you what has actually been done.</DialogDescription>
      <ol className={styles.guideSteps}>
        <li><strong>1. Give the team a useful brief</strong><p>Choose the client, describe the goal, audience, offer, budget, deadline and outputs needed. Unknown facts should be marked unknown.</p></li>
        <li><strong>2. Chief assigns the work</strong><p>Chief uses available client context to create tasks and dependencies. Everyone returns to their seat; only relevant specialists are assigned work.</p></li>
        <li><strong>3. Specialists execute</strong><p>Independent tasks can run together. Dependent work waits for upstream results. Open a task to inspect its instructions and actual output.</p></li>
        <li><strong>4. Resolve missing input</strong><p>If critical information is missing, the mission pauses. Answer in Actions. Continuing creates a linked follow-up mission with your answer; it is not a silent guess.</p></li>
        <li><strong>5. QA reviews, then Chief delivers</strong><p>QA checks evidence, contradictions and gaps. Depending on budget mode, a low quality score can trigger a bounded correction round. AI review is not a guarantee of accuracy.</p></li>
        <li><strong>6. Turn the result into action</strong><p>Check assumptions, owners and next steps. Copy the result or open saved deliverables. Approval executes supported artifacts into their listed KretivOS destination—not automatically into external ad platforms.</p></li>
      </ol>
      <details className={styles.guideDetails}><summary>What do the characters mean?</summary><p>Free time: brew and drink coffee, read, stretch or sit by the TV. During a mission: return to their own seats. Assigned agents work; unassigned agents wait. Animation never spends AI credits or determines task completion.</p><p>If the office is still, check Motion and your device’s Reduce Motion setting. Those controls do not stop the real mission.</p></details>
      <details className={styles.guideDetails}><summary>How do I improve a result?</summary><p>Open the saved mission and revise the relevant task with specific feedback. Review any downstream outputs marked stale. A specialist revision does not automatically regenerate Chief’s final result; start a follow-up mission if the final recommendation needs updating.</p></details>
      <div className={styles.dialogActions}>
        {onPrepareBrief && <DialogClose asChild><button type="button" onClick={onPrepareBrief}>Add brief checklist</button></DialogClose>}
        {onOpenMission && <DialogClose asChild><button type="button" onClick={onOpenMission}>Mission board</button></DialogClose>}
        {onOpenActions && <DialogClose asChild><button type="button" onClick={onOpenActions}>Actions & approvals</button></DialogClose>}
        {onOpenArchive && <DialogClose asChild><button type="button" onClick={onOpenArchive}>Saved missions</button></DialogClose>}
      </div>
    </DialogContent>
  </Dialog>;
}
