import { getDatabase } from "@/lib/db";
import type { AiCompletion } from "@/lib/ai-nonymauz";

export type OfficeUsageRecord = {
  stage: string;
  agentId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type OfficeUsageReporter = (record: OfficeUsageRecord) => void;

function numeric(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function officeUsageRecord(completion: AiCompletion, stage: string, agentId?: string): OfficeUsageRecord {
  const promptTokens = numeric(completion.usage?.prompt_tokens);
  const completionTokens = numeric(completion.usage?.completion_tokens);
  const totalTokens = numeric(completion.usage?.total_tokens) || promptTokens + completionTokens;
  const model = String(completion.model || "unknown");
  const inputRate = numeric(process.env.AI_OFFICE_INPUT_USD_PER_MILLION);
  const outputRate = numeric(process.env.AI_OFFICE_OUTPUT_USD_PER_MILLION);
  const estimatedCostUsd = (promptTokens / 1_000_000) * inputRate + (completionTokens / 1_000_000) * outputRate;
  return { stage, agentId, model, promptTokens, completionTokens, totalTokens, estimatedCostUsd };
}

export async function persistOfficeTelemetry(missionId: string, records: OfficeUsageRecord[]) {
  if (!missionId || !records.length) return { totalTokens: 0, estimatedCostUsd: 0 };
  const totalTokens = records.reduce((sum, item) => sum + item.totalTokens, 0);
  const estimatedCostUsd = records.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
  const sql = getDatabase();
  await sql`
    update ai_office_missions
       set total_tokens = coalesce(total_tokens, 0) + ${totalTokens},
           estimated_cost = coalesce(estimated_cost, 0) + ${estimatedCostUsd},
           updated_at = now()
     where id = ${missionId}::uuid
  `;
  await sql`
    insert into ai_office_events (mission_id, workspace_id, event_type, actor, payload)
    select m.id, m.workspace_id, 'usage.recorded', 'system', ${JSON.stringify({ totalTokens, estimatedCostUsd, calls: records })}::jsonb
      from ai_office_missions m where m.id = ${missionId}::uuid
  `;
  return { totalTokens, estimatedCostUsd };
}
