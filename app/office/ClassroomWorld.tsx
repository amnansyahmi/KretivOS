"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OfficeAgentStatus, OfficeWorldAgent } from "./OfficeWorld";

type Props = {
  agents: OfficeWorldAgent[];
  motion?: boolean;
  missionTitle?: string;
  missionStatus?: string;
  artifactCount?: number;
  approvalCount?: number;
  attentionCount?: number;
  memoryCount?: number;
  onSelectAgent?: (agent: OfficeWorldAgent) => void;
  onOpenMission?: () => void;
  onOpenArchive?: () => void;
  onOpenNotice?: () => void;
};

type Hit =
  | { kind: "agent"; x: number; y: number; w: number; h: number; agent: OfficeWorldAgent }
  | { kind: "mission" | "archive" | "notice"; x: number; y: number; w: number; h: number };

const MAX_SPECIALISTS = 6;
const IDLE_DEFAULTS = ["research", "business", "sales", "marketing", "content", "qa"];

function statusColor(status: OfficeAgentStatus) {
  if (status === "working") return "#d9ff62";
  if (status === "completed") return "#44d6a6";
  if (status === "blocked" || status === "failed") return "#ffbd45";
  if (status === "queued") return "#69b9ff";
  return "#59645d";
}

function statusPriority(status: OfficeAgentStatus) {
  if (status === "working") return 0;
  if (status === "blocked" || status === "failed") return 1;
  if (status === "queued") return 2;
  if (status === "completed") return 3;
  return 4;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxChars = 42) {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return "No active mission";
  const candidate = source.length > maxChars ? `${source.slice(0, maxChars - 1)}…` : source;
  if (ctx.measureText(candidate).width <= maxWidth) return candidate;
  let value = candidate;
  while (value.length > 8 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value.trim()}…`;
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, active: boolean) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y + 28 * scale, 42 * scale, 10 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0.18, -0.55, 0.28, 0, 0);
  ctx.fillStyle = active ? "#465638" : "#303832";
  ctx.strokeStyle = active ? "rgba(217,255,98,.35)" : "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  ctx.fillRect(-38 * scale, -18 * scale, 76 * scale, 36 * scale);
  ctx.strokeRect(-38 * scale, -18 * scale, 76 * scale, 36 * scale);
  ctx.restore();

  roundedRect(ctx, x - 13 * scale, y - 18 * scale, 26 * scale, 18 * scale, 3 * scale);
  ctx.fillStyle = "#090d0a";
  ctx.fill();
  ctx.strokeStyle = active ? "rgba(217,255,98,.42)" : "rgba(255,255,255,.08)";
  ctx.stroke();
  ctx.fillStyle = active ? "rgba(217,255,98,.18)" : "rgba(255,255,255,.035)";
  ctx.fillRect(x - 9 * scale, y - 14 * scale, 18 * scale, 8 * scale);

  ctx.fillStyle = "#374038";
  ctx.fillRect(x - 1.5 * scale, y, 3 * scale, 11 * scale);
  ctx.fillRect(x - 8 * scale, y + 10 * scale, 16 * scale, 2 * scale);
}

function drawShelf(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count: number) {
  roundedRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = "#171e19";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.stroke();
  ctx.fillStyle = "rgba(217,255,98,.58)";
  ctx.font = "600 9px ui-sans-serif, system-ui";
  ctx.fillText("ARCHIVE", x + 10, y + 16);
  ctx.fillStyle = "rgba(255,255,255,.32)";
  ctx.font = "8px ui-sans-serif, system-ui";
  ctx.fillText(`${count} memories`, x + 10, y + 29);
  for (let row = 0; row < 3; row += 1) {
    const sy = y + 42 + row * 27;
    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(x + 9, sy + 16, w - 18, 2);
    const colors = ["#566343", "#31463b", "#6c5b36", "#3b4f58", "#504056"];
    for (let i = 0; i < 5; i += 1) {
      const bookW = 6 + (i % 3);
      const bookH = 10 + ((i + row) % 4) * 2;
      ctx.fillStyle = colors[(i + row) % colors.length];
      ctx.fillRect(x + 12 + i * 12, sy + 15 - bookH, bookW, bookH);
    }
  }
}

function drawNotice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, approvals: number, attention: number) {
  roundedRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = "#1b1d17";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,189,69,.15)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "600 9px ui-sans-serif, system-ui";
  ctx.fillText("ACTION BOARD", x + 10, y + 16);
  const items = [
    { label: "Approvals", value: approvals, color: "#d9ff62" },
    { label: "Attention", value: attention, color: "#ffbd45" },
  ];
  items.forEach((item, index) => {
    const iy = y + 41 + index * 35;
    ctx.fillStyle = "rgba(255,255,255,.04)";
    roundedRect(ctx, x + 9, iy - 12, w - 18, 27, 6);
    ctx.fill();
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(x + 19, iy + 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.43)";
    ctx.font = "8px ui-sans-serif, system-ui";
    ctx.fillText(item.label, x + 28, iy + 4);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.font = "600 10px ui-sans-serif, system-ui";
    ctx.fillText(String(item.value), x + w - 15, iy + 4);
    ctx.textAlign = "left";
  });
}

export default function ClassroomWorld({
  agents,
  motion = true,
  missionTitle = "",
  missionStatus = "Ready",
  artifactCount = 0,
  approvalCount = 0,
  attentionCount = 0,
  memoryCount = 0,
  onSelectAgent,
  onOpenMission,
  onOpenArchive,
  onOpenNotice,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef<Hit[]>([]);
  const [size, setSize] = useState({ width: 0, height: 520 });
  const [selected, setSelected] = useState<string | null>(null);

  const chief = agents.find((agent) => agent.id === "chief");
  const specialists = useMemo(() => {
    const active = agents
      .filter((agent) => agent.id !== "chief" && agent.status !== "standby")
      .sort((a, b) => statusPriority(a.status) - statusPriority(b.status));
    const picked = [...active];
    if (picked.length < MAX_SPECIALISTS) {
      for (const id of IDLE_DEFAULTS) {
        const agent = agents.find((item) => item.id === id);
        if (agent && !picked.some((item) => item.id === id)) picked.push(agent);
        if (picked.length >= MAX_SPECIALISTS) break;
      }
    }
    return picked.slice(0, MAX_SPECIALISTS);
  }, [agents]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(280, Math.floor(entry.contentRect.width));
      const height = width < 520 ? 430 : width < 900 ? 500 : 570;
      setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback((time = 0) => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const compact = size.width < 520;
    const scale = compact ? 0.78 : size.width < 900 ? 0.92 : 1.05;
    const W = size.width;
    const H = size.height;
    const backWallH = compact ? 122 : 145;

    const wall = ctx.createLinearGradient(0, 0, 0, backWallH);
    wall.addColorStop(0, "#151b16");
    wall.addColorStop(1, "#101511");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, backWallH);

    ctx.fillStyle = "#0b0f0c";
    ctx.beginPath();
    ctx.moveTo(0, backWallH);
    ctx.lineTo(W, backWallH);
    ctx.lineTo(W * 0.91, H);
    ctx.lineTo(W * 0.09, H);
    ctx.closePath();
    ctx.fill();

    const tile = compact ? 46 : 58;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, backWallH);
    ctx.lineTo(W, backWallH);
    ctx.lineTo(W * 0.91, H);
    ctx.lineTo(W * 0.09, H);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.025)";
    ctx.lineWidth = 1;
    for (let y = backWallH; y < H + tile; y += tile * 0.55) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let x = -W; x < W * 2; x += tile) {
      ctx.beginPath();
      ctx.moveTo(W / 2, backWallH);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.restore();

    const boardW = compact ? Math.min(W * 0.56, 255) : Math.min(W * 0.44, 440);
    const boardH = compact ? 72 : 84;
    const boardX = (W - boardW) / 2;
    const boardY = 20;
    roundedRect(ctx, boardX, boardY, boardW, boardH, 10);
    ctx.fillStyle = "#0b120d";
    ctx.fill();
    ctx.strokeStyle = "rgba(217,255,98,.22)";
    ctx.stroke();
    ctx.fillStyle = "#d9ff62";
    ctx.font = `${compact ? 8 : 9}px ui-sans-serif, system-ui`;
    ctx.fillText("MISSION BOARD", boardX + 12, boardY + 17);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.font = `600 ${compact ? 11 : 13}px ui-sans-serif, system-ui`;
    ctx.fillText(fitText(ctx, missionTitle || "Ready for the next mission", boardW - 24, compact ? 34 : 48), boardX + 12, boardY + 38);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.font = `${compact ? 8 : 9}px ui-sans-serif, system-ui`;
    ctx.fillText(`${missionStatus} · ${artifactCount} deliverables`, boardX + 12, boardY + 58);

    const shelfW = compact ? 66 : 86;
    const shelfH = compact ? 96 : 112;
    const shelfX = compact ? 10 : 22;
    const shelfY = compact ? 18 : 20;
    drawShelf(ctx, shelfX, shelfY, shelfW, shelfH, memoryCount);

    const noticeW = compact ? 72 : 92;
    const noticeH = compact ? 88 : 102;
    const noticeX = W - noticeW - (compact ? 10 : 22);
    const noticeY = compact ? 20 : 22;
    drawNotice(ctx, noticeX, noticeY, noticeW, noticeH, approvalCount, attentionCount);

    const hits: Hit[] = [
      { kind: "mission", x: boardX, y: boardY, w: boardW, h: boardH },
      { kind: "archive", x: shelfX, y: shelfY, w: shelfW, h: shelfH },
      { kind: "notice", x: noticeX, y: noticeY, w: noticeW, h: noticeH },
    ];

    const chiefX = W / 2;
    const chiefY = backWallH + (compact ? 56 : 68);
    drawDesk(ctx, chiefX, chiefY, scale * 1.04, chief?.status === "working");
    if (chief) {
      const bob = motion && chief.status === "working" ? Math.sin(time / 320) * 2 : 0;
      ctx.font = `${compact ? 25 : 31}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(chief.emoji, chiefX, chiefY - 43 * scale + bob);
      const color = statusColor(chief.status);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(chiefX + 20 * scale, chiefY - 52 * scale, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.78)";
      ctx.font = `600 ${compact ? 8 : 10}px ui-sans-serif, system-ui`;
      ctx.fillText("CHIEF", chiefX, chiefY + 44 * scale);
      hits.push({ kind: "agent", x: chiefX - 34, y: chiefY - 62, w: 68, h: 116, agent: chief });
    }

    const zoneY1 = backWallH + (compact ? 142 : 170);
    const rowGap = compact ? 94 : 112;
    const leftX = W * (compact ? 0.32 : 0.31);
    const rightX = W * (compact ? 0.68 : 0.69);
    const positions = [
      [leftX, zoneY1], [rightX, zoneY1],
      [leftX, zoneY1 + rowGap], [rightX, zoneY1 + rowGap],
      [leftX, zoneY1 + rowGap * 2], [rightX, zoneY1 + rowGap * 2],
    ];

    specialists.forEach((agent, index) => {
      const [x, y] = positions[index];
      const active = agent.status === "working";
      const isSelected = selected === agent.id;
      drawDesk(ctx, x, y, scale, active);
      const bob = motion && active ? Math.sin(time / 280 + index) * 2 : 0;
      ctx.font = `${compact ? 22 : 28}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (isSelected) {
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(217,255,98,.4)";
        ctx.fillText(agent.emoji, x, y - 40 * scale + bob);
        ctx.restore();
      } else {
        ctx.fillText(agent.emoji, x, y - 40 * scale + bob);
      }
      const color = statusColor(agent.status);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 19 * scale, y - 49 * scale, 3.6, 0, Math.PI * 2);
      ctx.fill();

      const showLabel = isSelected || active || agent.status === "blocked" || agent.status === "failed" || !compact;
      if (showLabel) {
        ctx.fillStyle = isSelected ? "rgba(217,255,98,.82)" : "rgba(255,255,255,.48)";
        ctx.font = `600 ${compact ? 7 : 9}px ui-sans-serif, system-ui`;
        ctx.fillText(agent.name.length > 16 ? `${agent.name.slice(0, 15)}…` : agent.name, x, y + 40 * scale);
      }
      hits.push({ kind: "agent", x: x - 38, y: y - 64, w: 76, h: 118, agent });
    });

    if (!compact) {
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(217,255,98,.2)";
      ctx.font = "600 9px ui-sans-serif, system-ui";
      ctx.fillText("STRATEGY / GROWTH", 28, backWallH + 155);
      ctx.textAlign = "right";
      ctx.fillText("COMMERCIAL / PRODUCT", W - 28, backWallH + 155);
      ctx.textAlign = "left";
    }

    hitRef.current = hits;
  }, [approvalCount, artifactCount, attentionCount, chief, memoryCount, missionStatus, missionTitle, motion, selected, size, specialists]);

  useEffect(() => {
    let raf = 0;
    const frame = (time: number) => {
      draw(time);
      if (motion && [chief, ...specialists].some((agent) => agent?.status === "working")) raf = requestAnimationFrame(frame);
    };
    frame(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [chief, draw, motion, specialists]);

  function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const p = pointerPosition(event);
    const hit = [...hitRef.current].reverse().find((item) => p.x >= item.x && p.x <= item.x + item.w && p.y >= item.y && p.y <= item.y + item.h);
    if (!hit) return;
    if (hit.kind === "agent") {
      setSelected(hit.agent.id);
      onSelectAgent?.(hit.agent);
    } else if (hit.kind === "mission") onOpenMission?.();
    else if (hit.kind === "archive") onOpenArchive?.();
    else if (hit.kind === "notice") onOpenNotice?.();
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-full overflow-hidden rounded-[24px] border border-white/[.07] bg-[#0d120e] shadow-[0_28px_70px_rgba(0,0,0,.28)]">
      <canvas
        ref={canvasRef}
        className="block w-full select-none touch-manipulation"
        aria-label="Interactive KretivOS strategy classroom"
        onPointerUp={handlePointerUp}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-white/[.06] bg-black/35 px-2.5 py-2 backdrop-blur-md">
        <div className="text-[8px] uppercase tracking-[.18em] text-white/28">Strategy classroom</div>
        <div className="mt-0.5 text-[9px] text-white/48">Tap the board, shelf, notice board or a specialist</div>
      </div>
    </div>
  );
}
