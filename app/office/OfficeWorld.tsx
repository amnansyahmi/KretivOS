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
type AgentSpot = OfficeWorldAgent & { wx: number; wy: number };

type Camera = { x: number; y: number; zoom: number };

const TILE_W = 86;
const TILE_H = 43;
const ROOM_W = 13;
const ROOM_H = 10;

const AGENT_SPOTS: Record<string, [number, number]> = {
  chief: [6, 1],
  research: [2, 2.4],
  business: [4, 2.4],
  marketing: [8, 2.4],
  content: [10, 2.4],
  sales: [2, 5],
  pricing: [4, 5],
  proposal: [6, 5],
  product: [8, 5],
  ux: [10, 5],
  architect: [2.5, 7.5],
  frontend: [4.5, 7.5],
  backend: [6.5, 7.5],
  security: [8.5, 7.5],
  qa: [10.5, 7.5],
};

const DEPARTMENT_ZONES = [
  { label: "STRATEGY", x: 3, y: 2.4 },
  { label: "GROWTH", x: 9, y: 2.4 },
  { label: "COMMERCIAL", x: 3, y: 5.1 },
  { label: "PRODUCT", x: 9, y: 5.1 },
  { label: "ENGINEERING", x: 5.4, y: 7.7 },
  { label: "QUALITY", x: 10.5, y: 7.7 },
];

function statusColor(status: OfficeAgentStatus) {
  if (status === "working") return "#d9ff62";
  if (status === "completed") return "#41d9a5";
  if (status === "blocked" || status === "failed") return "#ffbe38";
  if (status === "queued") return "#62b8ff";
  return "#69736b";
}

function project(wx: number, wy: number, camera: Camera, width: number, height: number): Point {
  const isoX = (wx - wy) * (TILE_W / 2);
  const isoY = (wx + wy) * (TILE_H / 2);
  return {
    x: width / 2 + (isoX + camera.x) * camera.zoom,
    y: 86 + (isoY + camera.y) * camera.zoom,
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

function drawDesk(ctx: CanvasRenderingContext2D, p: Point, zoom: number, active: boolean) {
  const deskW = 78 * zoom;
  const deskH = 34 * zoom;
  const y = p.y + 12 * zoom;

  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(p.x, y + 25 * zoom, 49 * zoom, 15 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, y);
  ctx.transform(1, 0.33, -1, 0.33, 0, 0);
  ctx.fillStyle = active ? "#536136" : "#343d36";
  ctx.strokeStyle = active ? "rgba(217,255,98,.5)" : "rgba(255,255,255,.12)";
  ctx.lineWidth = Math.max(1, zoom);
  ctx.fillRect(-deskW / 2, -deskH / 2, deskW, deskH);
  ctx.strokeRect(-deskW / 2, -deskH / 2, deskW, deskH);
  ctx.restore();

  const monitorW = 36 * zoom;
  const monitorH = 25 * zoom;
  roundedRect(ctx, p.x - monitorW / 2, p.y - 20 * zoom, monitorW, monitorH, 5 * zoom);
  ctx.fillStyle = "#0b100d";
  ctx.fill();
  ctx.strokeStyle = active ? "rgba(217,255,98,.62)" : "rgba(255,255,255,.12)";
  ctx.stroke();
  roundedRect(ctx, p.x - 13 * zoom, p.y - 14 * zoom, 26 * zoom, 12 * zoom, 2 * zoom);
  ctx.fillStyle = active ? "rgba(217,255,98,.25)" : "rgba(255,255,255,.05)";
  ctx.fill();

  ctx.fillStyle = "#404a42";
  ctx.fillRect(p.x - 2 * zoom, p.y + 5 * zoom, 4 * zoom, 12 * zoom);
  ctx.fillRect(p.x - 11 * zoom, p.y + 15 * zoom, 22 * zoom, 3 * zoom);

  roundedRect(ctx, p.x - 16 * zoom, p.y + 26 * zoom, 32 * zoom, 25 * zoom, 12 * zoom);
  ctx.fillStyle = "#202722";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.1)";
  ctx.stroke();
}

function drawPlant(ctx: CanvasRenderingContext2D, p: Point, zoom: number) {
  ctx.fillStyle = "#2a362d";
  roundedRect(ctx, p.x - 10 * zoom, p.y + 4 * zoom, 20 * zoom, 16 * zoom, 4 * zoom);
  ctx.fill();
  ctx.fillStyle = "#285a3b";
  ctx.beginPath();
  ctx.ellipse(p.x - 5 * zoom, p.y, 5 * zoom, 13 * zoom, -0.5, 0, Math.PI * 2);
  ctx.ellipse(p.x + 5 * zoom, p.y - 2 * zoom, 5 * zoom, 13 * zoom, 0.5, 0, Math.PI * 2);
  ctx.ellipse(p.x, p.y - 8 * zoom, 5 * zoom, 14 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

export default function OfficeWorld({ agents, motion = true, onSelectAgent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 440 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: -28, zoom: 0.82 });
  const cameraRef = useRef(camera);
  const [selected, setSelected] = useState<string | null>(null);
  const hitMapRef = useRef<Array<{ agent: OfficeWorldAgent; x: number; y: number; r: number }>>([]);

  useEffect(() => { cameraRef.current = camera; }, [camera]);

  const spots = useMemo<AgentSpot[]>(() => agents.map((agent, index) => {
    const fallback: [number, number] = [1.5 + (index % 5) * 2.1, 2 + Math.floor(index / 5) * 2.5];
    const [wx, wy] = AGENT_SPOTS[agent.id] || fallback;
    return { ...agent, wx, wy };
  }), [agents]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(280, Math.floor(entry.contentRect.width));
      const height = width < 520 ? 430 : width < 900 ? 500 : 560;
      setSize({ width, height });
      setCamera((current) => ({ ...current, zoom: width < 520 ? 0.62 : width < 900 ? 0.76 : 0.9, x: 0, y: width < 520 ? -18 : -28 }));
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

    // Isometric floor.
    for (let x = 0; x < ROOM_W; x++) {
      for (let y = 0; y < ROOM_H; y++) {
        const p = project(x + 0.5, y + 0.5, cam, size.width, size.height);
        diamond(ctx, p, TILE_W * cam.zoom, TILE_H * cam.zoom);
        const alt = (x + y) % 2 === 0;
        ctx.fillStyle = alt ? "#151b16" : "#121813";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.025)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Back wall / glass strip.
    const wallA = project(0, 0, cam, size.width, size.height);
    const wallB = project(ROOM_W, 0, cam, size.width, size.height);
    ctx.strokeStyle = "rgba(217,255,98,.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wallA.x, wallA.y - 14 * cam.zoom);
    ctx.lineTo(wallB.x, wallB.y - 14 * cam.zoom);
    ctx.stroke();

    // Department separators.
    ctx.save();
    ctx.setLineDash([5, 8]);
    ctx.strokeStyle = "rgba(255,255,255,.045)";
    const sep1 = project(6.4, 1.8, cam, size.width, size.height);
    const sep2 = project(6.4, 6.3, cam, size.width, size.height);
    ctx.beginPath();
    ctx.moveTo(sep1.x, sep1.y);
    ctx.lineTo(sep2.x, sep2.y);
    ctx.stroke();
    ctx.restore();

    // Plants and meeting table.
    drawPlant(ctx, project(0.8, 1.1, cam, size.width, size.height), cam.zoom);
    drawPlant(ctx, project(11.9, 8.8, cam, size.width, size.height), cam.zoom);
    const meet = project(6.2, 3.7, cam, size.width, size.height);
    ctx.save();
    ctx.translate(meet.x, meet.y + 12 * cam.zoom);
    ctx.transform(1, 0.32, -1, 0.32, 0, 0);
    ctx.fillStyle = "#252e27";
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(-42 * cam.zoom, -22 * cam.zoom, 84 * cam.zoom, 44 * cam.zoom);
    ctx.strokeRect(-42 * cam.zoom, -22 * cam.zoom, 84 * cam.zoom, 44 * cam.zoom);
    ctx.restore();

    // Zone labels.
    ctx.textAlign = "center";
    ctx.font = `${Math.max(7, 9 * cam.zoom)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    for (const zone of DEPARTMENT_ZONES) {
      const p = project(zone.x, zone.y + 0.82, cam, size.width, size.height);
      ctx.fillText(zone.label, p.x, p.y + 50 * cam.zoom);
    }

    const hits: Array<{ agent: OfficeWorldAgent; x: number; y: number; r: number }> = [];
    const sorted = [...spots].sort((a, b) => (a.wx + a.wy) - (b.wx + b.wy));
    for (const agent of sorted) {
      const base = project(agent.wx, agent.wy, cam, size.width, size.height);
      const active = agent.status === "working";
      drawDesk(ctx, base, cam.zoom, active);

      const bob = motion && active ? Math.sin(time / 260 + agent.wx) * 2.5 * cam.zoom : 0;
      const avatarY = base.y - 48 * cam.zoom + bob;
      const avatarR = 18 * cam.zoom;
      ctx.save();
      ctx.beginPath();
      ctx.arc(base.x, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fillStyle = selected === agent.id ? "#253126" : "#111612";
      ctx.fill();
      ctx.strokeStyle = selected === agent.id ? "rgba(217,255,98,.72)" : "rgba(255,255,255,.12)";
      ctx.lineWidth = selected === agent.id ? 2 : 1;
      ctx.stroke();
      ctx.font = `${Math.max(13, 21 * cam.zoom)}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(agent.emoji, base.x, avatarY + 1);
      ctx.restore();

      const color = statusColor(agent.status);
      ctx.beginPath();
      ctx.arc(base.x + 24 * cam.zoom, avatarY - 11 * cam.zoom, 4.3 * cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = color;
      if (active) {
        ctx.shadowBlur = 14 * cam.zoom;
        ctx.shadowColor = color;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = `600 ${Math.max(8, 10.5 * cam.zoom)}px ui-sans-serif, system-ui`;
      ctx.fillStyle = selected === agent.id ? "#f4f7ee" : "rgba(244,247,238,.82)";
      ctx.fillText(agent.name.length > 18 ? `${agent.name.slice(0, 17)}…` : agent.name, base.x, base.y + 68 * cam.zoom);
      ctx.font = `${Math.max(6.5, 7.5 * cam.zoom)}px ui-sans-serif, system-ui`;
      ctx.fillStyle = "rgba(255,255,255,.28)";
      ctx.fillText(agent.department.toUpperCase(), base.x, base.y + 81 * cam.zoom);

      hits.push({ agent, x: base.x, y: avatarY, r: Math.max(22, 30 * cam.zoom) });
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
    setCamera((current) => ({ ...current, zoom: Math.max(0.45, Math.min(1.35, current.zoom + delta)) }));
  }

  function resetCamera() {
    const width = size.width;
    setCamera({ x: 0, y: width < 520 ? -18 : -28, zoom: width < 520 ? 0.62 : width < 900 ? 0.76 : 0.9 });
  }

  function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = pointerPosition(event);
    pointerRef.current = { id: event.pointerId, x: p.x, y: p.y };
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
    const moved = Math.hypot(p.x - pointer.x, p.y - pointer.y);
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

      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/[.06] bg-black/35 px-2.5 py-2 backdrop-blur-md">
        <div className="text-[8px] uppercase tracking-[.18em] text-white/30">Live office map</div>
        <div className="mt-0.5 text-[10px] text-white/65">Drag to explore · tap an agent</div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-white/[.07] bg-black/45 p-1 backdrop-blur-md">
        <button type="button" onClick={() => zoomBy(-0.08)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[.06]" aria-label="Zoom out"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={resetCamera} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[.06]" aria-label="Reset office view"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => zoomBy(0.08)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 hover:bg-white/[.06]" aria-label="Zoom in"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
