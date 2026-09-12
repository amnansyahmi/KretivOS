"use client";

import { memo } from "react";
import styles from "./office-diorama.module.css";

// Portrait windows into the same artwork keep the detail sheet visually
// consistent without downloading seven separate character images.
const portraits: Record<string, [number, number]> = {
  chief: [455, 650], research: [465, 405], business: [690, 310],
  sales: [1250, 570], pricing: [1040, 635], marketing: [760, 545], qa: [915, 410],
};

export const WorkstationArt = memo(function WorkstationArt({ agentId }: { agentId: string }) {
  const point = portraits[agentId];
  // Extended specialists are not depicted in the seven-person room.
  if (!point) return <svg viewBox="0 0 100 100" className={styles.workstationArt} aria-hidden="true" focusable="false">
    <circle cx="50" cy="35" r="18" fill="var(--muted-text)" />
    <path d="M17 91V80a33 33 0 0166 0v11Z" fill="var(--steel)" />
  </svg>;
  return <svg viewBox={`${point[0] - 90} ${point[1] - 80} 180 180`} className={styles.workstationArt} aria-hidden="true" focusable="false">
    <image href="/office/warm-office-v2.webp" width="1448" height="1086" />
  </svg>;
});
