import type { SceneAgent } from "./office-scene.ts";

export type Point = { x: number; y: number };
// Foot positions on the empty-room artwork, normalized to 1000 × 750.
// Navigation follows authored aisles; it never takes a direct shortcut to a desk.
export const WALK_NODES: Record<string, Point> = {
  chief: { x: 405, y: 491 }, research: { x: 319, y: 331 },
  business: { x: 467, y: 261 }, marketing: { x: 535, y: 434 },
  qa: { x: 649, y: 337 }, sales: { x: 887, y: 453 }, pricing: { x: 739, y: 506 },
  west: { x: 256, y: 346 }, westTop: { x: 225, y: 290 }, back: { x: 379, y: 246 },
  westLow: { x: 374, y: 405 }, centre: { x: 427, y: 440 },
  front: { x: 520, y: 546 }, mid: { x: 600, y: 472 },
  east: { x: 713, y: 421 }, eastTop: { x: 731, y: 347 },
  eastLow: { x: 801, y: 487 },
  coffee: { x: 768, y: 324 }, read: { x: 238, y: 325 },
  stretch: { x: 493, y: 593 }, lounge: { x: 416, y: 525 },
};
export const WALK_EDGES: [string, string][] = [
  ["research", "west"], ["west", "westTop"], ["westTop", "back"], ["back", "business"],
  ["west", "westLow"], ["westLow", "centre"], ["centre", "chief"],
  ["centre", "front"], ["front", "mid"], ["mid", "marketing"],
  ["mid", "east"], ["east", "eastTop"], ["eastTop", "qa"],
  ["east", "eastLow"], ["eastLow", "pricing"], ["eastLow", "sales"],
  ["eastTop", "coffee"],
  ["west", "read"], ["front", "stretch"], ["front", "lounge"],
];
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function officeRoute(from: string, to: string): string[] {
  if (!WALK_NODES[from] || !WALK_NODES[to] || from === to) return [];
  const costs = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set(Object.keys(WALK_NODES));
  while (pending.size) {
    const node = [...pending].sort((a, b) => (costs.get(a) ?? Infinity) - (costs.get(b) ?? Infinity))[0];
    pending.delete(node);
    if (node === to) break;
    for (const edge of WALK_EDGES.filter(e => e.includes(node))) {
      const next = edge[0] === node ? edge[1] : edge[0];
      const cost = (costs.get(node) ?? Infinity) + distance(WALK_NODES[node], WALK_NODES[next]);
      if (cost < (costs.get(next) ?? Infinity)) { costs.set(next, cost); previous.set(next, node); }
    }
  }
  const path: string[] = [];
  let node = to;
  while (node !== from) {
    path.unshift(node);
    const parent = previous.get(node);
    if (!parent) return [];
    node = parent;
  }
  return path;
}

export type Activity = "walking" | "typing" | "thinking" | "reviewing" | "waiting" | "celebrating" | "coffee" | "read" | "stretch" | "lounge" | "idle";
export const ACTIVITY_LABELS: Record<Activity, string> = {
  walking: "Walking", typing: "At workstation", thinking: "Planning", reviewing: "Checking work",
  waiting: "Waiting", celebrating: "Work delivered", coffee: "Coffee break", read: "Browsing books",
  stretch: "Stretching", lounge: "Taking a break", idle: "Available",
};
const idleSpots = ["coffee", "read", "stretch", "lounge"] as const;
export type Walker = Point & {
  id: string; node: string; next: string | null; destination: string; route: string[];
  activity: Activity; facing: number; wait: number; lastStatus: SceneAgent["status"];
};
export function createWalker(id: string, index = 0): Walker {
  return { ...WALK_NODES[id], id, node: id, next: null, destination: id, route: [], activity: "idle", facing: 1, wait: 2 + index * 1.8, lastStatus: "standby" };
}
export function stepWalker(w: Walker, status: SceneAgent["status"], dt: number, occupied: Set<string>, random = Math.random, hasPlan = true): Walker {
  const n: Walker = { ...w, route: [...w.route], wait: Math.max(0, w.wait - dt) };
  const onDuty = status === "working" || status === "queued" || status === "blocked" || status === "failed";
  if (status !== n.lastStatus) {
    n.lastStatus = status;
    n.wait = status === "completed" ? 3 : 0;
    if (status === "completed" && !n.next) n.activity = "celebrating";
  }
  let target = n.destination;
  if (onDuty) target = n.id;
  else if (!n.next && !n.route.length && n.wait === 0) {
    const choices = idleSpots.filter(s => !occupied.has(s) && s !== n.node);
    target = choices.length ? choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] : n.id;
    n.wait = 8 + random() * 12;
  }
  if (target !== n.destination) {
    n.destination = target;
    // If interrupted mid-aisle, finish this segment then re-route. No teleporting.
    n.route = officeRoute(n.next || n.node, target);
  }
  if (!n.next && n.route.length) n.next = n.route.shift()!;
  if (n.next) {
    const end = WALK_NODES[n.next];
    const remaining = distance(n, end);
    const amount = Math.min(remaining, dt * 46);
    if (Math.abs(end.x - n.x) > 1) n.facing = end.x < n.x ? -1 : 1;
    if (remaining) { n.x += (end.x - n.x) / remaining * amount; n.y += (end.y - n.y) / remaining * amount; }
    n.activity = "walking";
    if (remaining <= amount) {
      n.node = n.next; n.next = null;
      if (!n.route.length) n.wait = onDuty ? 0 : 8 + random() * 12;
    }
  } else if (onDuty) {
    n.activity = status !== "working" ? "waiting" : n.id === "qa" ? "reviewing" : n.id === "chief" && !hasPlan ? "thinking" : "typing";
  } else if (!(n.activity === "celebrating" && n.wait > 0)) {
    n.activity = idleSpots.includes(n.node as typeof idleSpots[number]) ? n.node as Activity : "idle";
  }
  return n;
}
