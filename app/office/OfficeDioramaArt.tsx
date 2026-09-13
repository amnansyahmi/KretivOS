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
      <g className={styles.seatedLegs}>
        <path d="M25 63L12 72 16 93" fill="none" stroke="var(--steel)" strokeWidth="9" strokeLinecap="round" />
        <path d="M35 65L26 77 31 95" fill="none" stroke="var(--char-trousers)" strokeWidth="9" strokeLinecap="round" />
        <path d="M16 94L8 96M31 96L24 99" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" />
      </g>
      <g className={styles.leftLeg}><path d="M24 62L23 79 21 95" fill="none" stroke="var(--steel)" strokeWidth="9" strokeLinecap="round" /><path d="M20 94L14 97Q13 101 25 99L26 95" fill="var(--ink)" /></g>
      <g className={styles.rightLeg}><path d="M36 62L38 80 39 95" fill="none" stroke="var(--char-trousers)" strokeWidth="9" strokeLinecap="round" /><path d="M37 94L36 98Q43 102 49 99L42 94" fill="var(--ink)" /></g>
      <g className={styles.upperBody}>
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
      <g className={styles.rearHead}><ellipse cx="30" cy="19" rx="12" ry="15" fill={hair} /><path d="M23 30Q29 34 36 28" fill="none" stroke={skin} strokeWidth="4" /></g>
      <g className={styles.coffeeProp}><path d="M38 43H49V55Q43 59 38 54Z" fill="var(--char-paper)" /><path d="M49 45Q57 45 52 52H49" fill="none" stroke="var(--char-paper)" strokeWidth="2" /></g>
      <g className={styles.bookProp}><path d="M14 46L30 49 46 44 45 60 30 65 15 61Z" fill="var(--zone-strategy)" stroke="var(--char-paper)" strokeWidth="2" /><path d="M30 49V65" stroke="var(--char-paper)" /></g>
      <path className={styles.remoteProp} d="M15 56L22 54 25 67 18 69Z" fill="var(--ink)" stroke="var(--steel-light)" />
      </g>
    </g>
  </svg>;
});

export const OfficeActivityProps = memo(function OfficeActivityProps() {
  return <>
    <svg className={styles.commandDesk} viewBox="0 0 200 150" aria-hidden="true">
      <ellipse cx="102" cy="124" rx="90" ry="18" fill="var(--ink)" opacity=".2" />
      <path d="M24 62V114L38 121V69M167 61V108L180 114V61" fill="var(--steel)" />
      <path d="M9 56L110 19 193 58 94 102Z" fill="var(--wood-light)" stroke="var(--wood)" strokeWidth="3" />
      <path d="M9 56V65L94 111 193 67V58L94 102Z" fill="var(--wood)" />
      <path d="M54 43V11L100 28V61Z" fill="var(--ink)" stroke="var(--steel-light)" strokeWidth="3" />
      <path d="M59 19L94 32V50L59 37Z" fill="var(--steel)" /><path d="M66 28L85 35M66 34L80 39" stroke="var(--lime)" strokeWidth="2" />
      <path d="M80 72L111 59 134 70 102 84Z" fill="var(--steel-light)" />
    </svg>
    <svg className={styles.coffeeMachine} viewBox="0 0 60 75" aria-hidden="true">
      <path d="M8 11L38 1 53 11V61L22 73 8 62Z" fill="var(--steel)" stroke="var(--steel-light)" />
      <path d="M23 22L47 14V48L23 58Z" fill="var(--ink)" /><circle cx="17" cy="21" r="3" fill="var(--lime)" />
      <path d="M30 27V38" stroke="var(--steel-light)" strokeWidth="5" />
      <path className={styles.coffeePour} d="M30 39V48" stroke="var(--wood-light)" strokeWidth="2" />
      <path d="M24 48H37V58Q31 62 24 58Z" fill="var(--ceramic)" />
      <path className={styles.coffeeSteam} d="M25 6Q19 -3 28 -9M35 3Q28 -7 37 -14" fill="none" stroke="var(--muted-text)" strokeWidth="2" />
    </svg>
    <svg className={styles.tvPicture} viewBox="0 0 100 80" aria-hidden="true"><path d="M0 31L100 0V48L0 80Z" fill="var(--steel)" /><path d="M0 65L25 36 48 47 76 13 100 25V48L0 80Z" fill="var(--zone-strategy)" /><circle cx="78" cy="17" r="5" fill="var(--brass)" /></svg>
  </>;
});
