/**
 * Concurrency tests for the shared workspace-state blob.
 *
 * These run against an in-memory store that mimics the Postgres semantics we
 * depend on: `commit` succeeds only when the supplied version still matches.
 * The first test deliberately reproduces the original lost-update bug so the
 * regression is pinned rather than described.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  mutateWorkspaceState,
  WorkspaceConflictError,
  type WorkspaceStore,
} from "./workspace-state.ts";

type Blob = { attendance: { id: string }[] };

/** In-memory stand-in for the `workspace_state` row. */
function fakeStore(initial: Blob) {
  let data = structuredClone(initial);
  let version = 1;
  const commits: number[] = [];

  const store: WorkspaceStore<Blob> = {
    async load() {
      return { data: structuredClone(data), version };
    },
    async create(next) {
      data = structuredClone(next);
      return { data: structuredClone(data), version };
    },
    async commit(next, expectedVersion) {
      if (expectedVersion !== version) return null;
      data = structuredClone(next);
      version += 1;
      commits.push(version);
      return version;
    },
  };

  return { store, commits, current: () => data, versionNow: () => version };
}

const defaults = (): Blob => ({ attendance: [] });

test("the unguarded write this replaced loses a concurrent record", async () => {
  const { store } = fakeStore({ attendance: [] });

  // Both requests read the same version, exactly as two people clocking in at
  // 9am did. This is the OLD behaviour: commit without checking the version.
  const ali = await store.load();
  const siti = await store.load();

  ali!.data.attendance.push({ id: "ali" });
  siti!.data.attendance.push({ id: "siti" });

  // Unconditional writes, ignoring the version — the behaviour this replaced.
  const unguarded = async (next: Blob, _expectedVersion: number) => { await store.create(next); };
  await unguarded(ali!.data, ali!.version);
  await unguarded(siti!.data, siti!.version);

  const final = await store.load();
  assert.equal(final!.data.attendance.length, 1, "demonstrates the lost update");
  assert.deepEqual(final!.data.attendance.map((row) => row.id), ["siti"], "Ali's clock-in was erased");
});

test("interleaved mutations both survive under compare-and-swap", async () => {
  const { store, current } = fakeStore({ attendance: [] });

  // Force a genuine interleave: Siti commits while Ali's mutation is in flight,
  // so Ali's first attempt is guaranteed to hit a stale version.
  let aliAttempts = 0;
  const ali = mutateWorkspaceState(store, defaults, async (state) => {
    aliAttempts += 1;
    if (aliAttempts === 1) {
      await mutateWorkspaceState(store, defaults, (inner) => { inner.attendance.push({ id: "siti" }); });
    }
    state.attendance.push({ id: "ali" });
  });

  await ali;

  const ids = current().attendance.map((row) => row.id).sort();
  assert.deepEqual(ids, ["ali", "siti"], "neither clock-in was lost");
  assert.equal(aliAttempts, 2, "Ali's mutation re-ran against fresh state");
});

test("many simultaneous writers all land", async () => {
  const { store, current } = fakeStore({ attendance: [] });
  const people = Array.from({ length: 12 }, (_, index) => `person-${index}`);

  await Promise.all(people.map((id) =>
    mutateWorkspaceState(store, defaults, (state) => { state.attendance.push({ id }); }, { attempts: 40 }),
  ));

  assert.equal(current().attendance.length, people.length, "every writer is present exactly once");
  assert.deepEqual(current().attendance.map((row) => row.id).sort(), [...people].sort());
});

test("a mutation is re-run, not partially applied, after a conflict", async () => {
  const { store, current } = fakeStore({ attendance: [] });
  let attempts = 0;

  await mutateWorkspaceState(store, defaults, async (state) => {
    attempts += 1;
    state.attendance.push({ id: `attempt-${attempts}` });
    if (attempts === 1) {
      // Someone else commits, invalidating this attempt.
      await mutateWorkspaceState(store, defaults, (inner) => { inner.attendance.push({ id: "other" }); });
    }
  });

  const ids = current().attendance.map((row) => row.id).sort();
  assert.deepEqual(ids, ["attempt-2", "other"], "the discarded first attempt left no trace");
});

test("validation sees state committed by the winner of a race", async () => {
  const { store } = fakeStore({ attendance: [] });
  let attempts = 0;

  // Mimics a duplicate check: the record only exists on the retry, and the
  // mutation must then reject rather than write a second copy.
  await assert.rejects(
    () => mutateWorkspaceState(store, defaults, async (state) => {
      attempts += 1;
      if (state.attendance.some((row) => row.id === "shift-1")) {
        throw new Error("Attendance for this shift already exists.");
      }
      if (attempts === 1) {
        await mutateWorkspaceState(store, defaults, (inner) => { inner.attendance.push({ id: "shift-1" }); });
      }
      state.attendance.push({ id: "shift-1" });
    }),
    /already exists/,
    "the stale-read duplicate was caught on re-validation",
  );
  assert.equal(attempts, 2);
});

test("commits collections the mutation rebinds, not only ones it mutates in place", async () => {
  const { store, current } = fakeStore({ attendance: [{ id: "existing" }] });

  // The HR branches assign whole new arrays (`state.attendance = [...]`) rather
  // than pushing. A wrapper that hands the mutation a *copy* of the state would
  // silently drop exactly this, so the committed blob is asserted directly.
  await mutateWorkspaceState(store, defaults, (state) => {
    state.attendance = [...state.attendance, { id: "added" }];
  });

  assert.deepEqual(
    current().attendance.map((row) => row.id),
    ["existing", "added"],
    "a rebound collection reached the store",
  );
});

test("gives up with a conflict error rather than looping forever", async () => {
  const { store } = fakeStore({ attendance: [] });
  // A store that never accepts a commit stands in for permanent contention.
  const hostile: WorkspaceStore<Blob> = { ...store, commit: async () => null };

  await assert.rejects(
    () => mutateWorkspaceState(hostile, defaults, (state) => { state.attendance.push({ id: "x" }); }, { attempts: 3 }),
    WorkspaceConflictError,
  );
});
