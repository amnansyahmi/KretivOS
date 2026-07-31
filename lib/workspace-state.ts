/**
 * Optimistic concurrency for the shared `workspace_state` blob.
 *
 * The HR routes kept the entire HRMS — employees, leave, claims, payroll,
 * attendance, goals, learning and settings — in one `workspace_state` row and
 * wrote it back with an unconditional
 *
 *     do update set data = excluded.data, version = version + 1
 *
 * The `version` column was read on load and then ignored on save, which makes
 * every write a lost-update race:
 *
 *     1. Ali clocks in   → loads the blob at v5
 *     2. Siti clocks in  → loads the blob at v5
 *     3. Ali's write commits   → v6, contains Ali
 *     4. Siti's write commits  → v7, built from her v5 snapshot; Ali is gone
 *
 * No error, no conflict, nothing in the audit log. Attendance is the worst case
 * because the whole team clocks in within the same few minutes each morning.
 *
 * `commitState` now guards on the version it read, and `mutateWorkspaceState`
 * re-runs the mutation against fresh state when that guard fails. Retrying is
 * only safe because the mutation must be free of side effects — notifications
 * and audit entries are queued and flushed by the caller *after* the state
 * commits. See `HR_MUTATION_CONTRACT` below.
 *
 * Neon's HTTP driver runs each query on its own connection, so session-scoped
 * `pg_advisory_lock` is not available; compare-and-swap is the mechanism that
 * works over that transport.
 */

export const HR_MUTATION_CONTRACT =
  "A workspace-state mutation may be executed more than once. It must not write to any other table, " +
  "send a notification or append an audit entry. Queue those and flush them after the commit succeeds.";

export type WorkspaceSnapshot<T> = { data: T; version: number };

/** The storage operations, isolated so the retry logic is testable without a database. */
export type WorkspaceStore<T> = {
  load: () => Promise<WorkspaceSnapshot<T> | null>;
  create: (data: T) => Promise<WorkspaceSnapshot<T>>;
  /** Returns the new version, or null when `expectedVersion` no longer matches. */
  commit: (data: T, expectedVersion: number) => Promise<number | null>;
};

export class WorkspaceConflictError extends Error {
  constructor(message = "The workspace changed while this request was being processed. Please try again.") {
    super(message);
    this.name = "WorkspaceConflictError";
  }
}

export type MutationResult<R> = { result: R; version: number; attempts: number };

/**
 * Loads the state, applies `mutate`, and commits only if nothing else committed
 * in between. On conflict the mutation is discarded and re-run against freshly
 * loaded state, so validation that depends on current data (a leave balance, a
 * duplicate payroll period) is re-checked rather than decided on a stale read.
 *
 * `mutate` MUST obey HR_MUTATION_CONTRACT.
 */
export async function mutateWorkspaceState<T extends Record<string, any>, R>(
  store: WorkspaceStore<T>,
  defaults: () => T,
  mutate: (state: T) => Promise<R> | R,
  { attempts = 5 }: { attempts?: number } = {},
): Promise<MutationResult<R>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const snapshot = (await store.load()) ?? (await store.create(defaults()));

    // A deep copy per attempt: a partially applied mutation from a failed
    // attempt must not leak into the next one.
    const working = structuredClone(snapshot.data);
    const result = await mutate(working);

    const version = await store.commit(working, snapshot.version);
    if (version !== null) return { result, version, attempts: attempt };

    lastError = new WorkspaceConflictError();
    // Brief, jittered backoff so simultaneous clock-ins do not lock-step into
    // repeatedly colliding on every retry.
    if (attempt < attempts) await sleep(15 * attempt + Math.random() * 25);
  }

  throw lastError instanceof Error ? lastError : new WorkspaceConflictError();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
