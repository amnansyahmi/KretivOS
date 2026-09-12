"use client";

import { memo, useId } from "react";
import styles from "./office-diorama.module.css";

/** Small vector meshes, not image downloads or a WebGL render loop. */
export const WorkstationArt = memo(function WorkstationArt({ agentId, active = false }: { agentId: string; active?: boolean }) {
  const uid = useId().replaceAll(":", "");
  const chief = agentId === "chief";
  const glasses = ["business", "pricing", "qa"].includes(agentId);
  const headset = ["sales", "marketing"].includes(agentId);
  const longHair = ["chief", "marketing", "research"].includes(agentId);
  return <svg viewBox="0 0 200 166" fill="none" aria-hidden="true" focusable="false" className={styles.workstationArt} data-character={agentId}>
    <defs>
      <linearGradient id={`${uid}-desk`} x1="20" y1="65" x2="180" y2="145" gradientUnits="userSpaceOnUse"><stop stopColor="var(--wood-light)" /><stop offset="1" stopColor="var(--wood)" /></linearGradient>
      <linearGradient id={`${uid}-skin`}><stop stopColor="var(--skin-light)" /><stop offset="1" stopColor="var(--skin)" /></linearGradient>
      <linearGradient id={`${uid}-jacket`}><stop stopColor="var(--agent-coat)" /><stop offset="1" stopColor="var(--agent-coat-dark)" /></linearGradient>
    </defs>
    <ellipse cx="105" cy="144" rx="82" ry="18" fill="var(--ink)" opacity=".28" />
    {/* Pedestal chair, behind the seated character. */}
    <path d="M130 74V130M130 128L111 141M130 128L151 140M130 128L140 116" stroke="var(--steel)" strokeWidth="5" strokeLinecap="round" />
    <path d="M105 32Q131 19 148 34L146 83Q129 96 106 80Z" fill="var(--chair)" stroke="var(--steel)" strokeWidth="2" />
    <path d="M109 38Q129 29 142 38L140 75Q124 83 111 75Z" fill="var(--chair-light)" />
    <path d="M110 85L108 112 121 118M134 87L136 110 148 115" stroke="var(--trousers)" strokeWidth="10" strokeLinecap="round" />
    <path d="M115 118L125 122M143 116L153 119" stroke="var(--ink)" strokeWidth="7" strokeLinecap="round" />
    <g className={styles.character}>
      {longHair && <path d="M109 16Q131 3 140 25L143 51 106 52Z" fill="var(--hair)" />}
      <path d="M114 43Q103 45 102 57L106 85Q124 94 142 83L143 57Q139 45 127 43Z" fill={`url(#${uid}-jacket)`} />
      <path d="M116 44L124 65 130 44" fill="var(--shirt)" />
      {chief && <path d="M116 45L111 52 120 58 124 70M131 45L137 53 130 60" stroke="var(--shirt)" strokeOpacity=".4" strokeWidth="2" />}
      <path d="M119 36V45Q124 50 130 44V35" fill="var(--skin)" />
      <ellipse cx="124" cy="25" rx="15" ry="18" fill={`url(#${uid}-skin)`} />
      <path d={longHair ? "M108 27Q102 8 119 6Q140 2 141 26L134 20 129 13Q119 23 108 27Z" : "M109 23Q103 8 120 5Q140 2 140 23L131 15 122 18 113 16Z"} fill="var(--hair)" />
      <ellipse cx="137" cy="28" rx="3" ry="4" fill="var(--skin)" />
      <path d="M115 27h1M127 29h1" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M118 36Q121 39 125 37" stroke="var(--hair)" strokeWidth="1.5" strokeLinecap="round" />
      {glasses && <g stroke="var(--ink)" strokeWidth="1.5"><rect x="109" y="23" width="11" height="9" rx="3" /><rect x="123" y="25" width="11" height="9" rx="3" /><path d="M120 27L123 28M134 28L140 25" /></g>}
      {headset && <g stroke="var(--steel-light)" strokeWidth="3"><path d="M107 26Q101 3 123 2Q145 3 143 29" /><path d="M144 31Q147 41 129 41" /><rect x="138" y="22" width="7" height="13" rx="3" fill="var(--chair)" /></g>}
      <path d="M107 54L95 70 78 72M139 56L142 76 123 85" stroke={`url(#${uid}-jacket)`} strokeWidth="10" strokeLinecap="round" />
      <path d="M79 72L72 75M125 85L117 88" stroke="var(--skin-light)" strokeWidth="7" strokeLinecap="round" />
    </g>
    {/* Four legs and a thick, bevelled walnut desk. */}
    <path d="M32 105V137L39 140V108M91 129V158L98 155V125M165 105V134L172 130V103" fill="var(--steel)" />
    <path d="M21 95L112 61 182 95 89 132Z" fill={`url(#${uid}-desk)`} stroke="var(--wood-edge)" />
    <path d="M21 95L89 132V140L21 104Z" fill="var(--wood-dark)" />
    <path d="M89 132L182 95V103L89 140Z" fill="var(--wood-edge)" />
    <path d="M35 96L91 124 166 95" stroke="var(--wood-light)" strokeOpacity=".22" />
    {/* Monitor with extruded casing and screen. */}
    <path d="M78 94V108L96 114 108 110 91 103V95" fill="var(--steel)" />
    <path d="M48 54L104 76 111 73 55 51Z" fill="var(--steel-light)" />
    <path d="M104 76L111 73V108L104 112Z" fill="var(--steel)" />
    <path d="M48 54L104 76V112L48 90Z" fill="var(--ink)" stroke="var(--steel)" strokeWidth="2" />
    <path d="M53 60L99 79V103L53 85Z" fill={active ? "var(--screen-active)" : "var(--screen)"} />
    <g className={active ? styles.screenActivity : undefined} stroke="var(--agent-coat)" strokeWidth="2" opacity={active ? ".95" : ".5"}>
      <path d="M58 67L77 75M58 73L92 87M58 79L82 89" />
      <path d="M88 88V95M94 87V98" stroke="var(--lime)" />
    </g>
    <path d="M105 104L125 94 148 104 127 113Z" fill="var(--keyboard)" stroke="var(--steel)" />
    <path d="M113 104L126 99M122 108L136 103" stroke="var(--steel-light)" strokeWidth="2" />
    {/* Role-specific physical desk tools. */}
    {agentId === "qa" ? <g><path d="M160 77V88L153 101Q164 108 172 101L166 87V77" fill="var(--glass)" stroke="var(--steel-light)" /><path d="M157 97L168 98" stroke="var(--mint)" strokeWidth="5" /></g>
      : agentId === "research" ? <g stroke="var(--brass)" strokeWidth="3"><circle cx="157" cy="87" r="8" /><path d="M162 94L170 102" /></g>
      : agentId === "pricing" ? <g><path d="M149 88L165 81 176 88 160 96Z" fill="var(--keyboard)" /><path d="M153 89L165 84M160 91L171 87" stroke="var(--brass)" strokeWidth="2" /></g>
      : <g><path d="M153 84V96Q160 102 167 96V84" fill="var(--ceramic)" /><ellipse cx="160" cy="84" rx="7" ry="3" fill="var(--ink)" /><path d="M168 87Q178 87 169 95" stroke="var(--ceramic)" strokeWidth="3" /></g>}
    <circle cx="32" cy="101" r="2" fill="var(--state-color)" className={styles.statusLamp} />
  </svg>;
});

function Plant({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx="0" cy="8" rx="24" ry="9" fill="var(--ink)" opacity=".25" />
    <path d="M-15-12L-11 9Q0 19 12 9L16-12" fill="var(--ceramic)" /><ellipse cy="-12" rx="16" ry="7" fill="var(--wood-dark)" />
    <path d="M0-10V-60M0-20L-20-40M0-28L21-51" stroke="var(--leaf-dark)" strokeWidth="4" />
    <ellipse cx="-14" cy="-38" rx="8" ry="20" fill="var(--leaf)" transform="rotate(-40 -14 -38)" /><ellipse cx="14" cy="-48" rx="8" ry="21" fill="var(--leaf-dark)" transform="rotate(35 14 -48)" /><ellipse cx="0" cy="-62" rx="8" ry="19" fill="var(--leaf)" />
  </g>;
}

export const RoomArt = memo(function RoomArt() {
  const uid = useId().replaceAll(":", "");
  return <svg viewBox="0 0 1000 780" className={styles.roomArt} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--floor-light)" /><stop offset="1" stopColor="var(--floor)" /></linearGradient>
      <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--wall-light)" /><stop offset="1" stopColor="var(--wall)" /></linearGradient>
      <clipPath id={`${uid}-clip`}><path d="M40 445L480 191 960 419 520 737Z" /></clipPath>
    </defs>
    <path d="M30 468L480 206 974 436 532 763Z" fill="var(--ink)" opacity=".4" />
    <path d="M40 445L520 714 960 396V420L520 740 40 471Z" fill="var(--floor-edge)" stroke="var(--steel)" />
    <path d="M40 445L480 191 960 396 520 714Z" fill={`url(#${uid}-floor)`} />
    <g clipPath={`url(#${uid}-clip)`} stroke="var(--floor-line)" strokeWidth="1">
      {Array.from({ length: 18 }, (_, i) => <path key={i} d={`M${-350 + i * 70} 140l1100 620M${100 + i * 70} 140L${-850 + i * 70} 820`} />)}
    </g>
    {/* Two cutaway walls: the room's fixed architectural perspective. */}
    <path d="M40 445V252L480 26V191Z" fill={`url(#${uid}-wall)`} stroke="var(--wall-edge)" />
    <path d="M480 26L960 231V396L480 191Z" fill="var(--wall-side)" stroke="var(--wall-edge)" />
    <path d="M40 252L480 26 960 231" fill="none" stroke="var(--wall-edge)" strokeWidth="7" />
    <path d="M48 439L480 190 951 393" fill="none" stroke="var(--lime)" strokeOpacity=".32" strokeWidth="2" />
    <path d="M480 33V183" stroke="var(--wall-edge)" strokeWidth="3" />
    {/* Slatted acoustic wall and a glazed window. */}
    {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${75 + i * 13} ${260 - i * 7}v115`} stroke="var(--wood-dark)" strokeWidth="5" opacity=".7" />)}
    <path d="M818 193L927 240V330L818 283Z" fill="var(--glass)" stroke="var(--steel)" strokeWidth="5" />
    <path d="M855 210V298M890 225V313M820 238L925 284" stroke="var(--steel)" strokeWidth="3" />
    <path d="M823 197L880 222 823 274Z" fill="var(--steel-light)" opacity=".08" />
    {/* Raised Chief dais; woven zone rugs are anchored to the floor. */}
    <path d="M360 307L485 233 633 309 507 390 360 316Z" fill="var(--floor-edge)" />
    <path d="M360 307L485 233 633 300 507 381Z" fill="var(--platform)" stroke="var(--brass)" strokeOpacity=".45" />
    <path d="M125 414L271 334 469 450 323 554Z" fill="var(--zone-strategy)" fillOpacity=".2" stroke="var(--zone-strategy)" strokeOpacity=".35" />
    <path d="M386 532L615 387 795 484 567 651Z" fill="var(--zone-growth)" fillOpacity=".12" stroke="var(--zone-growth)" strokeOpacity=".35" />
    <path d="M696 407L808 338 920 390 807 473Z" fill="var(--zone-quality)" fillOpacity=".2" stroke="var(--zone-quality)" strokeOpacity=".35" />
    {/* Low glass partition and brass task lighting. */}
    <path d="M401 408V348L445 373V433Z" fill="var(--glass)" fillOpacity=".7" stroke="var(--steel)" strokeWidth="2" />
    <path d="M399 410L448 437" stroke="var(--steel)" strokeWidth="5" />
    <path d="M750 352V298L773 286" stroke="var(--brass)" strokeWidth="4" fill="none" />
    <path d="M760 285L778 278 794 289 775 297Z" fill="var(--ceramic)" />
    <Plant x={92} y={412} scale={.95} /><Plant x={908} y={361} scale={.9} /><Plant x={427} y={659} scale={.6} />
  </svg>;
});
