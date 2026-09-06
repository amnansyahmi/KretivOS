"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type OfficeAgentStatus = "standby" | "queued" | "working" | "completed" | "blocked" | "failed";

export type OfficeWorldAgent = {
  id: string;
  name: string;
  emoji: string;
  department: string;
  status: OfficeAgentStatus;
  detail?: string;
};

type Props = {
  agents: OfficeWorldAgent[];
  motion?: boolean;
  onSelectAgent?: (agent: OfficeWorldAgent) => void;
};

type Point = { x: number; y: number };
type Camera = { x: number; y: number; zoom: number };
type AgentSpot = OfficeWorldAgent & { wx: number; wy: number };

const TILE_W = 92;
const TILE_H = 46;
const ROOM_W = 13;
const ROOM_H = 10;
const MAX_VISIBLE = 7;

const LAYOUT_SLOTS: Array<[number, number]> = [
  [6.0, 2.0],
  [2.7, 3.7],
  [9.3, 3.7],
  [3.0, 6.6],
  [9.0, 6.6],
  [5.0, 8.1],
  [7.0, 8.1],
];

const IDLE_DEFAULTS = ["chief", "research", "business", "sales", "marketing", "qa"];

function statusColor(status: OfficeAgentStatus) {
  if (status === "working") return "#d9ff62";
  if (status === "completed") return "#41d9a5";
  if (status === "blocked" || status === "failed") return "#ffbe38";
  if (status === "queued") return "#62b8ff";
  return "#657069";
}

function statusPriority(status: OfficeAgentStatus) {
  if (status === "working") return 0;
  if (status === "blocked" || status === "failed") return 1;
  if (status === "queued") return 2;
  if (status === "completed") return 3;
  return 4;
}

function project(wx: number, wy: number, camera: Camera, width: number): Point {
  const isoX = (wx - wy) * (TILE_W / 2);
  const isoY = (wx + wy) * (TILE_H / 2);
  return {
    x: width / 2 + (isoX + camera.x) * camera.zoom,
    y: 62 + (isoY + camera.y) * camera.zoom,
  };
}

function diamond(ctx: CanvasRenderingContext2D, center: Point, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(center.x, center.y - h / 2);
  ctx.lineTo(center.x + w / 2, center.y);
  ctx.lineTo(center.x, center.y + h / 2);
  ctx.lineTo(center.x - w / 2, center.y);
  ctx.closePath();
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

function drawPlant(ctx: CanvasRenderingContext2D, p: Point, zoom: number) {
  ctx.fillStyle = "#273329";
  roundedRect(ctx, p.x - 9 * zoom, p.y + 4 * zoom, 18 * zoom, 15 * zoom, 4 * zoom);
  ctx.fill();
  ctx.fillStyle = "#2e6341";
  ctx.beginPath();
  ctx.ellipse(p.x - 5 * zoom, p.y - 1 * zoom, 4 * zoom, 11 * zoom, -0.5, 0, Math.PI * 2);
  ctx.ellipse(p.x + 5 * zoom, p.y - 2 * zoom, 4 * zoom, 11 * zoom, 0.5, 0, Math.PI * 2);
  ctx.ellipse(p.x, p.y - 8 * zoom, 4 * zoom, 12 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawStation(ctx: CanvasRenderingContext2D, p: Point, zoom: number, active: boolean, selected: boolean) {
  const floorY = p.y + 18 * zoom;

  ctx.save();
  ctx.globalAlpha = selected ? 0.32 : 0.18;
  ctx.fillStyle = selected ? "#d9ff62" : "#000";
  ctx.beginPath();
  ctx.ellipse(p.x, floorY + 21 * zoom, 48 * zoom, 14 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, floorY);
  ctx.transform(1, 0.32, -1, 0.32, 0, 0);
  ctx.fillStyle = active ? "#4c5834" : "#343d36";
  ctx.strokeStyle = selected
    ? "rgba(217,255,98,.72)"
    : active
      ? "rgba(217,255,98,.38)"
      : "rgba(255,255,255,.09)";
  ctx.lineWidth = Math.max(1, zoom);
  ctx.fillRect(-39 * zoom, -16 * zoom, 78 * zoom, 32 * zoom);
  ctx.strokeRect(-39 * zoom, -16 * zoom, 78 * zoom, 32 * zoom);
  ctx.restore();

  roundedRect(ctx, p.x - 18 * zoom, p.y - 16 * zoom, 36 * zoom, 25 * zoom, 5 * zoom);
  ctx.fillStyle = "#0b100d";
  ctx.fill();
  ctx.strokeStyle = active ? "rgba(217,255,98,.52)" : "rgba(255,255,255,.1)";
  ctx.stroke();

  roundedRect(ctx, p.x - 12 * zoom, p.y - 10 * zoom, 24 * zoom, 11 * zoom, 2 * zoom);
  ctx.fillStyle = active ? "rgba(217,255,98,.24)" : "rgba(255,255,255,.045)";
  ctx.fill();

  ctx.fillStyle = "#3c453e";
  ctx.fillRect(p.x - 2 * zoom, p.y + 8 * zoom, 4 * zoom, 10 * zoom);
  ctx.fillRect(p.x - 10 * zoom, p.y + 16 * zoom, 20 * zoom, 3 * zoom);

  roundedRect(ctx, p.x - 15 * zoom, p.y + 31 * zoom, 30 * zoom, 22 * zoom, 11 * zoom);
  ctx.fillStyle = "#202722";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.stroke();
}

export default function OfficeWorld({ agents, motion = true, onSelectAgent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 410 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: -22, zoom: 0.72 });
  const cameraRef = useRef(camera);
  const [selected, setSelected] = useState<string | null>(null);
  const hitMapRef = useRef<Array<{ agent: OfficeWorldAgent; x: number; y: number; r: number }>>([]);

  useEffect(() => { cameraRef.current = camera; }, [camera]);

  const visibleAgents = useMemo(() => {
    const chief = agents.find((agent) => agent.id === "chief");
    const active = agents
      .filter((agent) => agent.id !== "chief" && agent.status !== "standby")
      .sort((a, b) => statusPriority(a.status) - statusPriority(b.status));

    let picked: OfficeWorldAgent[] = chief ? [chief, ...active] : [...active];

    if (picked.length <= 1) {
      const idle = IDLE_DEFAULTS
        .map((id) => agents.find((agent) => agent.id === id))
        .filter((agent): agent is OfficeWorldAgent => Boolean(agent));
      picked = idle.length ? idle : agents.slice(0, MAX_VISIBLE);
    }

    if (selected) {
      const selectedAgent = agents.find((agent) => agent.id === selected);
      if (selectedAgent && !picked.some((agent) => agent.id === selectedAgent.id)) picked.unshift(selectedAgent);
    }

    return picked.slice(0, MAX_VISIBLE);
  }, [agents, selected]);

  const spots = useMemo<AgentSpot[]>(() => visibleAgents.map((agent, index) => {
    const [wx, wy] = LAYOUT_SLOTS[index] || LAYOUT_SLOTS[LAYOUT_SLOTS.length - 1];
    return { ...agent, wx, wy };
  }), [visibleAgents]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(280, Math.floor(entry.contentRect.width));
      const height = width < 520 ? 390 : width < 900 ? 470 : 540;
      const zoom = width < 520 ? 0.70 : width < 900 ? 0.82 : 0.96;
      const y = width < 520 ? -28 : -22;
      setSize({ width, height });
      setCamera({ x: 0, y, zoom });
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

    const cam = cameraRef.current;
    const bg = ctx.createLinearGradient(0, 0, 0, size.height);
    bg.addColorStop(0, "#121713");
    bg.addColorStop(1, "#0b0f0c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size.width, size.height);

    for (let x = 0; x < ROOM_W; x++) {
      for (let y = 0; y < ROOM_H; y++) {
        const p = project(x + 0.5, y + 0.5, cam, size.width);
        diamond(ctx, p, TILE_W * cam.zoom, TILE_H * cam.zoom);
        ctx.fillStyle = (x + y) % 2 === 0 ? "#151b16" : "#121813";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.018)";
        ctx.stroke();
      }
    }

    const wallLeft = project(0, 0, cam, size.width);
    const wallRight = project(ROOM_W, 0, cam, size.width);
    ctx.strokeStyle = "rgba(217,255,98,.09)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wallLeft.x, wallLeft.y - 13 * cam.zoom);
    ctx.lineTo(wallRight.x, wallRight.y - 13 * cam.zoom);
    ctx.stroke();

    drawPlant(ctx, project(1.0, 1.0, cam, size.width), cam.zoom);
    drawPlant(ctx, project(11.7, 8.8, cam, size.width), cam.zoom);

    const hits: Array<{ agent: OfficeWorldAgent; x: number; y: number; r: number }> = [];
    const sorted = [...spots].sort((a, b) => (a.wx + a.wy) - (b.wx + b.wy));

    for (const agent of sorted) {
      const base = project(agent.wx, agent.wy, cam, size.width);
      const active = agent.status === "working";
      const isSelected = selected === agent.id;
      drawStation(ctx, base, cam.zoom, active, isSelected);

      const bob = motion && active ? Math.sin(time / 300 + agent.wx) * 2 * cam.zoom : 0;
      const avatarY = base.y - 49 * cam.zoom + bob;
      const avatarR = 18 * cam.zoom;

      ctx.save();
      ctx.beginPath();
      ctx.arc(base.x, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#263329" : "#111612";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "rgba(217,255,98,.78)" : "rgba(255,255,255,.11)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();
      ctx.font = `${Math.max(14, 21 * cam.zoom)}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(agent.emoji, base.x, avatarY + 1);
      ctx.restore();

      const color = statusColor(agent.status);
      ctx.beginPath();
      ctx.arc(base.x + 24 * cam.zoom, avatarY - 11 * cam.zoom, 4.4 * cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = color;
      if (active) {
        ctx.shadowBlur = 14 * cam.zoom;
        ctx.shadowColor = color;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      const shouldLabel = isSelected || active || agent.status === "blocked" || agent.status === "failed" || size.width >= 700;
      if (shouldLabel) {
        const label = agent.name.length > 16 ? `${agent.name.slice(0, 15)}…` : agent.name;
        ctx.font = `600 ${Math.max(8, 10 * cam.zoom)}px ui-sans-serif, system-ui`;
        const textWidth = ctx.measureText(label).width;
        const labelW = textWidth + 18;
        const labelH = 19;
        const labelY = base.y + 62 * cam.zoom;

        roundedRect(ctx, base.x - labelW / 2, labelY - labelH + 2, labelW, labelH, 8);
        ctx.fillStyle = isSelected ? "rgba(20,26,21,.96)" : "rgba(9,13,10,.74)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "rgba(217,255,98,.24)" : "rgba(255,255,255,.05)";
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isSelected ? "#f4f7ee" : "rgba(244,247,238,.78)";
        ctx.fillText(label, base.x, labelY - 7);
      }

      hits.push({ agent, x: base.x, y: avatarY, r: Math.max(24, 31 * cam.zoom) });
    }

    hitMapRef.current = hits;
  }, [motion, selected, size, spots]);

  useEffect(() => {
    let raf = 0;
    const frame = (time: number) => {
      draw(time);
      if (motion && spots.some((agent) => agent.status === "working")) raf = requestAnimationFrame(frame);
    };
    frame(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [camera, draw, motion, size, spots]);

  function zoomBy(delta: number) {
    setCamera((current) => ({ ...current, zoom: Math.max(0.55, Math.min(1.3, current.zoom + delta)) }));
  }

  function resetCamera() {
    const width = size.width;
    setCamera({ x: 0, y: width < 520 ? -28 : -22, zoom: width < 520 ? 0.70 : width < 900 ? 0.82 : 0.96 });
  }

  function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = pointerPosition(event);
    pointerRef.current = { id: event.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const p = pointerPosition(event);
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      setCamera((current) => ({ ...current, x: current.x + dx / current.zoom, y: current.y + dy / current.zoom }));
      pointerRef.current = { ...pointer, x: p.x, y: p.y };
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const p = pointerPosition(event);
    const moved = Math.hypot(p.x - pointer.startX, p.y - pointer.startY);

    if (moved < 8) {
      const hit = [...hitMapRef.current].reverse().find((item) => Math.hypot(p.x - item.x, p.y - item.y) <= item.r);
      if (hit) {
        setSelected(hit.agent.id);
        onSelectAgent?.(hit.agent);
      }
    }

    pointerRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-full overflow-hidden rounded-[22px] border border-white/[.07] bg-[#0e120f]">
      <canvas
        ref={canvasRef}
        className="block w-full touch-none select-none"
        aria-label="Interactive isometric AI office"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerRef.current = null; }}
        onWheel={(event) => { event.preventDefault(); zoomBy(event.deltaY > 0 ? -0.06 : 0.06); }}
      />

      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/[.06] bg-black/38 px-2.5 py-2 backdrop-blur-md">
        <div className="text-[8px] uppercase tracking-[.18em] text-white/28">Live office</div>
        <div className="mt-0.5 text-[10px] text-white/62">{visibleAgents.length} relevant agents · tap to inspect</div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-white/[.07] bg-black/45 p-1 backdrop-blur-md">
        <button type="button" onClick={() => zoomBy(-0.08)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[.06]" aria-label="Zoom out"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={resetCamera} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[.06]" aria-label="Reset office view"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => zoomBy(0.08)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[.06]" aria-label="Zoom in"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
