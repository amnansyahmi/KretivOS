import type { SceneAgent } from "./office-scene.ts";

export type Point = { x: number; y: number };
// Foot positions on the empty-room artwork, normalized to 1000 × 750.
// Navigation follows authored aisles; it never takes a direct shortcut to a desk.
export const WALK_NODES: Record<string, Point> = {
  chief: { x: 554, y: 566 }, research: { x: 319, y: 331 },
  business: { x: 467, y: 261 }, marketing: { x: 535, y: 434 },
  qa: { x: 649, y: 337 }, sales: { x: 887, y: 453 }, pricing: { x: 739, y: 506 },
  west: { x: 256, y: 346 }, westTop: { x: 225, y: 290 }, back: { x: 379, y: 246 },
  westLow: { x: 374, y: 405 }, centre: { x: 427, y: 440 },
  front: { x: 520, y: 546 }, mid: { x: 600, y: 472 },
  east: { x: 713, y: 421 }, eastTop: { x: 731, y: 347 },
  eastLow: { x: 801, y: 487 },
  coffee: { x: 790, y: 315 }, coffeeDrink: { x: 800, y: 370 }, read: { x: 238, y: 325 },
  stretch: { x: 493, y: 593 }, lounge: { x: 315, y: 484 }, loungeEntry: { x: 398, y: 455 },
};
export const WALK_EDGES: [string, string][] = [
  ["research", "west"], ["west", "westTop"], ["westTop", "back"], ["back", "business"],
  ["west", "westLow"], ["westLow", "centre"], ["front", "chief"],
  ["centre", "front"], ["front", "mid"], ["mid", "marketing"],
  ["mid", "east"], ["east", "eastTop"], ["eastTop", "qa"],
  ["east", "eastLow"], ["eastLow", "pricing"], ["eastLow", "sales"],
  ["eastTop", "coffee"],
  ["coffee", "coffeeDrink"], ["coffeeDrink", "eastTop"],
  ["west", "read"], ["front", "stretch"], ["centre", "loungeEntry"], ["loungeEntry", "lounge"],
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

export type Activity = "walking" | "standing" | "sitting" | "typing" | "thinking" | "reviewing" | "waiting" | "celebrating" | "makingCoffee" | "coffee" | "read" | "stretch" | "lounge" | "idle";
export const ACTIVITY_LABELS: Record<Activity, string> = {
  walking: "Walking", standing: "Getting up", sitting: "Taking a seat", typing: "Working at desk",
  thinking: "Planning at desk", reviewing: "Reviewing at desk", waiting: "Seated · ready",
  celebrating: "Work delivered", makingCoffee: "Making coffee", coffee: "Drinking coffee",
  read: "Reading", stretch: "Stretching", lounge: "Watching TV", idle: "Seated · available",
};
const idleSpots = ["coffee", "read", "stretch", "lounge"] as const;
export type Walker = Point & {
  id: string; node: string; next: string | null; destination: string; route: string[];
  activity: Activity; facing: number; wait: number; lastStatus: SceneAgent["status"];
  activityTime: number; carryingCup: boolean;
};
export function seatedActivity(activity: Activity) {
  return ["sitting", "typing", "thinking", "reviewing", "waiting", "idle", "celebrating", "lounge"].includes(activity);
}
export function createWalker(id: string, index = 0): Walker {
  return { ...WALK_NODES[id], id, node: id, next: null, destination: id, route: [], activity: "idle",
    facing: 1, wait: 2 + index * 1.8, lastStatus: "standby", activityTime: 0, carryingCup: false };
}
/** missionActive recalls the WHOLE room without pretending unassigned agents have work. */
export function stepWalker(w: Walker, status: SceneAgent["status"], dt: number, occupied: Set<string>, random = Math.random, hasPlan = true, missionActive = false): Walker {
  dt = Math.max(0, Math.min(dt, .1));
  const n: Walker = { ...w, route: [...w.route], wait: Math.max(0, w.wait - dt), activityTime: w.activityTime + dt };
  const onDuty = missionActive || ["working", "queued", "blocked", "failed"].includes(status);
  const pose = (activity: Activity) => { if (n.activity !== activity) { n.activity = activity; n.activityTime = 0; } };
  if (status !== n.lastStatus) {
    n.lastStatus = status;
    if (status === "completed" && !onDuty && !n.next && !n.route.length) { pose("celebrating"); n.wait = 2; }
  }
  let target = n.destination;
  if (onDuty) { target = n.id; n.carryingCup = false; }
  else if (!n.next && !n.route.length && n.node === "coffee" && n.activity === "makingCoffee" && n.wait === 0) {
    // Brew first, then carry the cup away from the machine before drinking.
    n.carryingCup = true;
    if (!occupied.has("coffeeDrink")) target = "coffeeDrink";
    else n.wait = 1;
  } else if (!n.next && !n.route.length && n.wait === 0 && n.activity !== "sitting" && n.activity !== "standing") {
    const choices = idleSpots.filter(s => !occupied.has(s) && s !== n.node);
    target = choices.length ? choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] : n.id;
    n.wait = 10 + random() * 12;
    if (n.node === "coffeeDrink") n.carryingCup = false;
  }
  if (target !== n.destination) {
    n.destination = target;
    n.route = officeRoute(n.next || n.node, target);
    if (!n.next && seatedActivity(n.activity)) { pose("standing"); n.wait = .65; }
  }
  if (n.activity === "standing" && n.wait > 0) return n;
  if (!n.next && n.route.length) n.next = n.route.shift()!;
  if (n.next) {
    const end = WALK_NODES[n.next];
    const remaining = distance(n, end);
    // Ease into each waypoint to avoid snapping direction at full stride.
    const speed = Math.max(15, Math.min(46, remaining * 4));
    const amount = Math.min(remaining, dt * speed);
    if (Math.abs(end.x - n.x) > 1) n.facing = end.x < n.x ? -1 : 1;
    if (remaining) { n.x += (end.x - n.x) / remaining * amount; n.y += (end.y - n.y) / remaining * amount; }
    pose("walking");
    if (remaining <= amount) {
      n.node = n.next; n.next = null;
      if (!n.route.length) {
        n.wait = 10 + random() * 12;
        if (n.node === n.id || n.node === "lounge") { pose("sitting"); n.wait = .65; }
        else if (n.node === "coffee") { pose("makingCoffee"); n.wait = 5; }
        else if (n.node === "coffeeDrink") { pose("coffee"); n.wait = 9; }
      }
    }
    return n;
  }
  if (n.activity === "sitting" && n.wait > 0) return n;
  if (onDuty) {
    n.facing = n.id === "research" || n.id === "business" ? 1 : -1;
    pose(status !== "working" ? "waiting" : n.id === "qa" ? "reviewing" : n.id === "chief" && !hasPlan ? "thinking" : "typing");
    n.wait = 3;
  } else if (n.activity === "sitting") {
    pose(n.node === "lounge" ? "lounge" : "idle"); n.wait = 12 + random() * 12;
  } else if (n.node === "coffee" && n.activity === "makingCoffee") {
    // Stay at the machine for the full brew sequence.
  } else if (n.node === "coffeeDrink") pose("coffee");
  else if (!(n.activity === "celebrating" && n.wait > 0)) {
    pose(n.node === "lounge" ? "lounge" : n.node === "read" ? "read" : n.node === "stretch" ? "stretch" : "idle");
  }
  return n;
}
