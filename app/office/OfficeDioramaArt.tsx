"use client";

import { memo, useId } from "react";
import styles from "./office-diorama.module.css";

export const WorkstationArt = memo(function WorkstationArt({ agentId }: { agentId: string }) {
  const id = useId().replaceAll(":", "");
  const coat = "var(--agent-coat)", skin = "var(--skin)", hair = "var(--hair)";
  const longHair = ["research", "pricing", "marketing"].includes(agentId);
  return <svg viewBox="0 0 64 104" className={styles.workstationArt} data-character={agentId} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-coat`}><stop stopColor={coat} /><stop offset=".6" stopColor={coat} /><stop offset="1" stopColor="var(--agent-coat-dark)" /></linearGradient>
      <linearGradient id={`${id}-skin`}><stop stopColor={skin} /><stop offset="1" stopColor="var(--skin-shadow)" /></linearGradient>
    </defs>
    <ellipse cx="33" cy="98" rx="23" ry="5" fill="var(--ink)" opacity=".25" />
    <g className={styles.characterRig}>
      <g className={styles.leftLeg}><path d="M24 62L23 79 21 95" fill="none" stroke="var(--steel)" strokeWidth="9" strokeLinecap="round" /><path d="M20 94L14 97Q13 101 25 99L26 95" fill="var(--ink)" /></g>
      <g className={styles.rightLeg}><path d="M36 62L38 80 39 95" fill="none" stroke="var(--char-trousers)" strokeWidth="9" strokeLinecap="round" /><path d="M37 94L36 98Q43 102 49 99L42 94" fill="var(--ink)" /></g>
      {longHair && <path d="M20 18Q37 8 42 27L44 46 17 44Z" fill={hair} />}
      <path d="M20 35Q31 29 41 37L44 65Q32 72 18 64Z" fill={`url(#${id}-coat)`} />
      <path d="M35 34L41 38 44 65 35 68Z" fill="#000" opacity=".15" />
      <path d="M25 32L29 41 34 34" fill="var(--char-paper)" />
      {agentId === "chief" && <path d="M29 39L27 53 31 57 32 42" fill="var(--zone-strategy)" />}
      <g className={styles.leftArm}><path d="M20 39L14 51 17 64" fill="none" stroke={coat} strokeWidth="8" strokeLinecap="round" /><ellipse cx="17" cy="65" rx="4" ry="5" fill={skin} /></g>
      <g className={styles.rightArm}><path d="M40 40L46 51 44 64" fill="none" stroke={coat} strokeWidth="8" strokeLinecap="round" /><ellipse cx="44" cy="65" rx="4" ry="5" fill={skin} /></g>
      <path d="M26 25L26 35Q30 40 34 34L34 25" fill={skin} />
      <g className={styles.characterHead}>
        <path d="M20 17Q22 6 33 8Q44 10 40 24L35 31Q27 35 22 26Z" fill={`url(#${id}-skin)`} />
        <path d="M19 20Q15 6 29 4Q43 3 43 16L39 23 36 14Q26 19 23 13L23 24Z" fill={hair} />
        <ellipse cx="39" cy="22" rx="3" ry="4" fill={skin} />
        <path d="M27 22L29 22M33 21L35 21" stroke="var(--hair)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M29 28L34 27" stroke="var(--skin-shadow)" strokeLinecap="round" />
        {(agentId === "research" || agentId === "qa") && <path d="M24 20L30 20 30 24 24 24ZM32 20L38 19 38 23 32 24ZM30 21L32 21" fill="none" stroke="var(--steel)" strokeWidth="1" />}
        {agentId === "sales" && <path d="M20 18Q19 9 31 8Q43 9 42 21M42 21L42 28 37 29" fill="none" stroke="var(--ink)" strokeWidth="3" />}
      </g>
      <g className={styles.coffeeProp}><path d="M38 43H49V55Q43 59 38 54Z" fill="var(--char-paper)" /><path d="M49 45Q57 45 52 52H49" fill="none" stroke="var(--char-paper)" strokeWidth="2" /></g>
      <g className={styles.bookProp}><path d="M14 46L30 49 46 44 45 60 30 65 15 61Z" fill="var(--zone-strategy)" stroke="var(--char-paper)" strokeWidth="2" /><path d="M30 49V65" stroke="var(--char-paper)" /></g>
    </g>
  </svg>;
});
