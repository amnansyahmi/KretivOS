"use client";

type Props = {
  agentId: string;
  active?: boolean;
  className?: string;
};

const common = {
  stroke: "currentColor",
  strokeWidth: 2.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function AgentGlyph({ agentId, active = false, className = "" }: Props) {
  const accent = active ? "#d9ff62" : "#d7ddd8";
  const muted = active ? "#8ba13f" : "#59645d";

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
      style={{ color: accent }}
      fill="none"
    >
      <ellipse cx="32" cy="54" rx="17" ry="4.5" fill="rgba(0,0,0,.28)" />
      {glyph(agentId, accent, muted)}
    </svg>
  );
}

function glyph(agentId: string, accent: string, muted: string) {
  switch (agentId) {
    case "chief":
      return <>
        <circle cx="32" cy="17" r="7" fill={muted} opacity=".34" {...common} />
        <path d="M20 47c1.6-11 6.4-17 12-17s10.4 6 12 17" fill={muted} opacity=".22" {...common} />
        <path d="M27 31l5 7 5-7M29.5 22.5h5" {...common} />
        <path d="M24 47h16" {...common} />
      </>;
    case "research":
      return <>
        <circle cx="27" cy="25" r="11" fill={muted} opacity=".16" {...common} />
        <path d="M35 33l12 12" {...common} />
        <path d="M42.5 40.5l4.5 4.5" strokeWidth="5" stroke={accent} strokeLinecap="round" />
        <path d="M22 23c2.5-3 7-4 10-1" {...common} />
      </>;
    case "business":
      return <>
        <path d="M31 12c-5 4-7 9-7 15 0 5 2 8 5 10l-8 7v5h22v-5l-8-7c3-2 5-5 5-10 0-6-2-11-7-15" fill={muted} opacity=".18" {...common} />
        <path d="M25 30h14M22 49h22M28 19h8" {...common} />
      </>;
    case "sales":
      return <>
        <path d="M13 31l8-8 9 8-8 8zM51 31l-8-8-9 8 8 8z" fill={muted} opacity=".2" {...common} />
        <path d="M26 30l5-4c2-1.5 4-1 5.5.5L45 35M18 35l12 10c2 2 4 1 5.5-.5L46 34" {...common} />
        <path d="M28 41l4 3M33 38l4 3M38 35l4 3" {...common} />
      </>;
    case "proposal":
      return <>
        <path d="M19 11h20l8 8v34H19z" fill={muted} opacity=".16" {...common} />
        <path d="M39 11v9h8M25 29h16M25 36h16M25 43h11" {...common} />
      </>;
    case "pricing":
      return <>
        <circle cx="32" cy="31" r="18" fill={muted} opacity=".16" {...common} />
        <path d="M38 23c-2-2-4-3-7-3-4 0-7 2-7 5 0 8 15 3 15 11 0 4-4 7-9 7-3 0-6-1-8-3M32 16v30" {...common} />
      </>;
    case "marketing":
      return <>
        <path d="M15 33h10l18-10v18L25 35H15z" fill={muted} opacity=".18" {...common} />
        <path d="M25 35l4 13h-8l-3-13M46 25c3 3 4 7 4 10s-1 7-4 10" {...common} />
      </>;
    case "content":
      return <>
        <path d="M17 45l4-11 20-20 9 9-20 20z" fill={muted} opacity=".16" {...common} />
        <path d="M21 34l9 9M39 16l9 9M17 45l13-2" {...common} />
      </>;
    case "product":
      return <>
        <circle cx="32" cy="31" r="18" fill={muted} opacity=".14" {...common} />
        <path d="M32 15v8M32 39v8M16 31h8M40 31h8" {...common} />
        <path d="M32 31l10-8-5 12z" fill={accent} opacity=".42" {...common} />
      </>;
    case "ux":
      return <>
        <path d="M18 14h28v36H18z" fill={muted} opacity=".12" {...common} />
        <circle cx="26" cy="24" r="3" fill={accent} opacity=".55" />
        <path d="M33 22h8M23 33h18M23 40h12" {...common} />
      </>;
    case "architect":
      return <>
        <path d="M15 44h34M20 44V25l12-10 12 10v19" fill={muted} opacity=".12" {...common} />
        <path d="M26 44V31h12v13M17 25l15-12 15 12" {...common} />
      </>;
    case "frontend":
      return <>
        <rect x="12" y="14" width="40" height="30" rx="4" fill={muted} opacity=".12" {...common} />
        <path d="M21 27l6-5M21 27l6 5M43 22l-7 10M17 49h30" {...common} />
      </>;
    case "backend":
      return <>
        <ellipse cx="32" cy="17" rx="15" ry="6" fill={muted} opacity=".12" {...common} />
        <path d="M17 17v14c0 3 7 6 15 6s15-3 15-6V17M17 31v14c0 3 7 6 15 6s15-3 15-6V31" {...common} />
      </>;
    case "security":
      return <>
        <path d="M32 11l15 6v11c0 11-6 19-15 24-9-5-15-13-15-24V17z" fill={muted} opacity=".14" {...common} />
        <path d="M26 31l4 4 8-9" {...common} />
      </>;
    case "qa":
      return <>
        <path d="M25 12h14M29 12v13L18 46c-2 4 1 7 5 7h18c4 0 7-3 5-7L35 25V12" fill={muted} opacity=".12" {...common} />
        <path d="M22 42h20M25 36h14" {...common} />
        <circle cx="28" cy="46" r="2" fill={accent} opacity=".7" />
        <circle cx="36" cy="39" r="1.6" fill={accent} opacity=".55" />
      </>;
    default:
      return <>
        <circle cx="32" cy="22" r="8" fill={muted} opacity=".16" {...common} />
        <path d="M19 49c2-11 7-17 13-17s11 6 13 17" fill={muted} opacity=".12" {...common} />
      </>;
  }
}
