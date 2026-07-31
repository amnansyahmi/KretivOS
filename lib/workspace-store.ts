/**
 * Neon-backed implementation of the workspace-state store.
 *
 * Kept apart from lib/workspace-state.ts so the compare-and-swap retry logic
 * stays free of I/O imports and can be unit-tested by the node test runner
 * without a module resolver.
 */

import { getDatabase } from "@/lib/db";
import type { WorkspaceStore } from "@/lib/workspace-state";

const ORGANIZATION_ID = "org-kretivco";

export function neonWorkspaceStore<T extends Record<string, any>>(scope: string): WorkspaceStore<T> {
  return {
    async load() {
      const sql = getDatabase();
      const rows = await sql`
        select data, version from workspace_state
        where organization_id = ${ORGANIZATION_ID} and scope = ${scope}
        limit 1
      `;
      if (!rows.length) return null;
      return { data: rows[0].data as T, version: Number(rows[0].version || 1) };
    },

    async create(data: T) {
      const sql = getDatabase();
      // Another request may have created the row first; take theirs rather than
      // clobbering it, which is why this is a do-nothing conflict plus a re-read.
      const inserted = await sql`
        insert into workspace_state (organization_id, scope, version, data)
        values (${ORGANIZATION_ID}, ${scope}, 1, ${JSON.stringify(data)}::jsonb)
        on conflict (organization_id, scope) do nothing
        returning data, version
      `;
      if (inserted.length) return { data: inserted[0].data as T, version: Number(inserted[0].version) };

      const existing = await sql`
        select data, version from workspace_state
        where organization_id = ${ORGANIZATION_ID} and scope = ${scope}
        limit 1
      `;
      return { data: existing[0].data as T, version: Number(existing[0].version || 1) };
    },

    async commit(data: T, expectedVersion: number) {
      const sql = getDatabase();
      // The version predicate is the whole fix: if anyone else committed since
      // this request loaded, zero rows match and the caller retries.
      const rows = await sql`
        update workspace_state
        set data = ${JSON.stringify(data)}::jsonb,
            version = version + 1,
            updated_at = now()
        where organization_id = ${ORGANIZATION_ID}
          and scope = ${scope}
          and version = ${expectedVersion}
        returning version
      `;
      return rows.length ? Number(rows[0].version) : null;
    },
  };
}
