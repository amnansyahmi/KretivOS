import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";

const ORGANIZATION_ID = "org-kretivco";

export async function notifyOffice(input: { title: string; body?: string; type?: "info" | "success" | "warning"; missionId?: string | null }) {
  const sql = getDatabase();
  await sql`
    insert into notifications (id, organization_id, title, body, type, status, entity_type, entity_id)
    values (${randomUUID()}, ${ORGANIZATION_ID}, ${input.title}, ${input.body || null}, ${input.type || "info"}, 'Unread',
      'ai_office_mission', ${input.missionId || null})
  `;
}
