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

const TILE_W = 86;
const TILE_H = 43;
const ROOM_W = 10;
const ROOM_H = 10;
const MAX_VISIBLE = 7;

// Symmetrical isometric slots. Keeping wx - wy close to zero prevents the
// right-most workstation from being clipped on narrow phones.
const LAYOUT_SLOTS: Array<[number, number]> = [
  [4.0, 4.0],
  [3.0, 6.0],
  [6.0, 3.0],
  [4.0, 7.0],
  [5.5, 5.5],
  [7.0, 4.0],
  [6.5, 6.5],
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

function defaultCamera(width: number): Camera {
  if (width < 520) return { x: 0, y: -90, zoom: 0.64 };
  if (width < 900) return { x: 0, y: -88, zoom: 0.78 };
  return { x: 0, y: -84, zoom: 0.92 };
}

function project(wx: number, wy: number, camera: Camera, width: number): Point {
  const isoX = (wx - wy) * (TILE_W / 2);
  const isoY = (wx + wy) * (TILE_H / 2);
  return {
    x: width / 2 + (isoX + camera.x) * camera.zoom,
    y: 64 + (isoY + camera.y) * camera.zoom,
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
  roundedRect(ctx, p.x - 8 * zoom, p.y + 3 * zoom, 16 * zoom, 13 * zoom, 4 * zoom);
  ctx.fill();
  ctx.fillStyle = "#2e6341";
  ctx.beginPath();
  ctx.ellipse(p.x - 4 * zoom, p.y - 1 * zoom, 4 * zoom, 10 * zoom, -0.5, 0, Math.PI * 2);
  ctx.ellipse(p.x + 4 * zoom, p.y - 2 * zoom, 4 * zoom, 10 * zoom, 0.5, 0, Math.PI * 2);
  ctx.ellipse(p.x, p.y - 7 * zoom, 4 * zoom, 11 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawStation(ctx: CanvasRenderingContext2D, p: Point, zoom: number, active: boolean, selected: boolean) {
  const floorY = p.y + 15 * zoom;

  ctx.save();
  ctx.globalAlpha = selected ? 0.24 : 0.13;
  ctx.fillStyle = selected ? "#d9ff62" : "#000";
  ctx.beginPath();
  ctx.ellipse(p.x, floorY + 19 * zoom, 42 * zoom, 12 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, floorY);
  ctx.transform(1, 0.32, -1, 0.32, 0, 0);
  ctx.fillStyle = active ? "#465332" : "#323a34";
  ctx.strokeStyle = selected
    ? "rgba(217,255,98,.68)"
    : active
      ? "rgba(217,255,98,.32)"
      : "rgba(255,255,255,.075)";
  ctx.lineWidth = Math.max(1, zoom);
  ctx.fillRect(-34 * zoom, -14 * zoom, 68 * zoom, 28 * zoom);
  ctx.strokeRect(-34 * zoom, -14 * zoom, 68 * zoom, 28 * zoom);
  ctx.restore();

  roundedRect(ctx, p.x - 15 * zoom, p.y - 14 * zoom, 30 * zoom, 21 * zoom, 4 * zoom);
  ctx.fillStyle = "#0b100d";
  ctx.fill();
  ctx.strokeStyle = active ? "rgba(217,255,98,.48)" : "rgba(255,255,255,.09)";
  ctx.stroke();

  roundedRect(ctx, p.x - 10 * zoom, p.y - 9 * zoom, 20 * zoom, 9 * zoom, 2 * zoom);
  ctx.fillStyle = active ? "rgba(217,255,98,.22)" : "rgba(255,255,255,.04)";
  ctx.fill();

  ctx.fillStyle = "#394139";
  ctx.fillRect(p.x - 1.5 * zoom, p.y + 7 * zoom, 3 * zoom, 9 * zoom);

  roundedRect(ctx, p.x - 13 * zoom, p.y + 27 * zoom, 26 * zoom, 19 * zoom, 9 * zoom);
  ctx.fillStyle = "#202722";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.07)";
  ctx.stroke();
}

export default function OfficeWorld({ agents, motion = true, onSelectAgent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 360 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: -90, zoom: 0.64 });
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
      const height = width < 520 ? 350 : width < 900 ? 430 : 500;
      setSize({ width, height });
      setCamera(defaultCamera(width));
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
    bg.addColorStop(0, "#111612");
    bg.addColorStop(1, "#0b0f0c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size.width, size.height);

    for (let x = 0; x < ROOM_W; x++) {
      for (let y = 0; y < ROOM_H; y++) {
        const p = project(x + 0.5, y + 0.5, cam, size.width);
        diamond(ctx, p, TILE_W * cam.zoom, TILE_H * cam.zoom);
        ctx.fillStyle = (x + y) % 2 === 0 ? "#141a15" : "#111712";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.014)";
        ctx.stroke();
      }
    }

    drawPlant(ctx, project(2.0, 2.0, cam, size.width), cam.zoom);
    drawPlant(ctx, project(7.7, 7.7, cam, size.width), cam.zoom);

    const hits: Array<{ agent: OfficeWorldAgent; x: number; y: number; r: number }> = [];
    const sorted = [...spots].sort((a, b) => (a.wx + a.wy) - (b.wx + b.wy));

    for (const agent of sorted) {
      const base = project(agent.wx, agent.wy, cam, size.width);
      const active = agent.status === "working";
      const isSelected = selected === agent.id;
      drawStation(ctx, base, cam.zoom, active, isSelected);

      const bob = motion && active ? Math.sin(time / 300 + agent.wx) * 2 * cam.zoom : 0;
      const avatarY = base.y - 39 * cam.zoom + bob;

      // Keep characters visually light: no circular avatar container. The emoji
      // itself is the character, while selection is expressed by the desk glow.
      ctx.save();
      if (active || isSelected) {
        ctx.shadowBlur = 10 * cam.zoom;
        ctx.shadowColor = active ? "rgba(217,255,98,.28)" : "rgba(255,255,255,.12)";
      }
      ctx.font = `${Math.max(18, 25 * cam.zoom)}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(agent.emoji, base.x, avatarY);
      ctx.restore();

      const color = statusColor(agent.status);
      ctx.beginPath();
      ctx.arc(base.x + 18 * cam.zoom, avatarY - 10 * cam.zoom, 3.7 * cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = color;
      if (active) {
        ctx.shadowBlur = 11 * cam.zoom;
        ctx.shadowColor = color;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // On phones labels only appear for the selected/working agent. Priority
      // cards below the map carry the rest of the identity/status information.
      const shouldLabel = isSelected || active || (size.width >= 700 && (agent.status === "blocked" || agent.status === "failed"));
      if (shouldLabel) {
        const label = agent.name.length > 17 ? `${agent.name.slice(0, 16)}…` : agent.name;
        ctx.font = `600 ${Math.max(8, 10 * cam.zoom)}px ui-sans-serif, system-ui`;
        const labelW = ctx.measureText(label).width + 16;
        const labelY = base.y + 54 * cam.zoom;

        roundedRect(ctx, base.x - labelW / 2, labelY - 15, labelW, 18, 8);
        ctx.fillStyle = "rgba(9,13,10,.76)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "rgba(217,255,98,.20)" : "rgba(255,255,255,.045)";
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(244,247,238,.82)";
        ctx.fillText(label, base.x, labelY - 6);
      }

      hits.push({ agent, x: base.x, y: base.y, r: Math.max(34, 45 * cam.zoom) });
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
    setCamera((current) => ({ ...current, zoom: Math.max(0.54, Math.min(1.18, current.zoom + delta)) }));
  }

  function resetCamera() {
    setCamera(defaultCamera(size.width));
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
      setCamera((current) => ({
        ...current,
        x: Math.max(-180, Math.min(180, current.x + dx / current.zoom)),
        y: Math.max(-220, Math.min(30, current.y + dy / current.zoom)),
      }));
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

      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/[.05] bg-black/32 px-2.5 py-2 backdrop-blur-md">
        <div className="text-[8px] uppercase tracking-[.18em] text-white/27">Live office</div>
        <div className="mt-0.5 text-[10px] text-white/58">{visibleAgents.length} relevant agents · tap to inspect</div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-white/[.06] bg-black/42 p-1 backdrop-blur-md">
        <button type="button" onClick={() => zoomBy(-0.08)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/42 hover:bg-white/[.06]" aria-label="Zoom out"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={resetCamera} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/42 hover:bg-white/[.06]" aria-label="Reset office view"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => zoomBy(0.08)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/42 hover:bg-white/[.06]" aria-label="Zoom in"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
