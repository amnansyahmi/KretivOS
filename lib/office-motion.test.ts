import test from "node:test";
import assert from "node:assert/strict";
import { WALK_NODES, WALK_EDGES, officeRoute, createWalker, stepWalker } from "./office-motion.ts";
import { CORE_STATIONS } from "./office-scene.ts";

test("all stations reach every idle activity using authored aisle edges", () => {
  for (const station of CORE_STATIONS) for (const target of ["coffee", "read", "stretch", "lounge"]) {
    const route = officeRoute(station.id, target);
    assert.equal(route.at(-1), target);
    let previous: string = station.id;
    for (const node of route) {
      assert.ok(WALK_EDGES.some(e => e.includes(previous) && e.includes(node)), `${previous} → ${node}`);
      assert.ok(WALK_NODES[node].x > 0 && WALK_NODES[node].x < 1000);
      assert.ok(WALK_NODES[node].y > 0 && WALK_NODES[node].y < 750);
      previous = node;
    }
  }
});
test("standby agents autonomously choose a free activity and actually arrive", () => {
  let walker = createWalker("sales");
  for (let i = 0; i < 1200; i++) {
    walker = stepWalker(walker, "standby", .05, new Set(), () => 0);
    if (walker.activity === "coffee") break;
  }
  assert.equal(walker.node, "coffee");
  assert.equal(walker.activity, "coffee");
});
test("new work interrupts idle travel without a positional jump and returns to the desk", () => {
  let walker = createWalker("research");
  for (let i = 0; i < 90; i++) walker = stepWalker(walker, "standby", .05, new Set(), () => 0);
  assert.equal(walker.activity, "walking");
  const previous = walker;
  walker = stepWalker(walker, "working", .05, new Set(), () => 0);
  assert.ok(Math.hypot(walker.x - previous.x, walker.y - previous.y) <= 2.31);
  assert.equal(walker.destination, "research");
  for (let i = 0; i < 1200; i++) walker = stepWalker(walker, "working", .05, new Set(), () => 0);
  assert.equal(walker.node, "research"); assert.equal(walker.activity, "typing");
  assert.equal(walker.lastStatus, "working");
});
test("queued and blocked agents stay available at their station without fake work", () => {
  for (const status of ["queued", "blocked", "failed"] as const) {
    let walker = createWalker("sales");
    for (let i = 0; i < 1000; i++) walker = stepWalker(walker, status, .05, new Set());
    assert.equal(walker.node, "sales"); assert.equal(walker.activity, "waiting");
  }
});
test("QA review and Chief planning have distinct activities", () => {
  assert.equal(stepWalker(createWalker("qa"), "working", .05, new Set()).activity, "reviewing");
  assert.equal(stepWalker(createWalker("chief"), "working", .05, new Set(), () => 0, false).activity, "thinking");
  assert.equal(stepWalker(createWalker("chief"), "working", .05, new Set(), () => 0, true).activity, "typing");
});
test("completed work celebrates briefly then returns to idle life", () => {
  let walker = stepWalker(createWalker("sales"), "completed", .05, new Set(), () => 0);
  assert.equal(walker.activity, "celebrating");
  for (let i = 0; i < 100; i++) walker = stepWalker(walker, "completed", .05, new Set(), () => 0);
  assert.equal(walker.activity, "walking"); assert.equal(walker.lastStatus, "completed");
});
test("occupied idle spots are not double-booked", () => {
  let walker = createWalker("sales"); walker.wait = 0;
  walker = stepWalker(walker, "standby", .05, new Set(["coffee", "read", "stretch"]), () => 0);
  assert.equal(walker.destination, "lounge");
});
test("unknown destinations never produce invented straight-line paths", () => {
  assert.deepEqual(officeRoute("sales", "outside"), []);
  assert.deepEqual(officeRoute("sales", "sales"), []);
});
