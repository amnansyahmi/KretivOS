-- AI Office final hardening: idempotent artifact execution leases.
create table if not exists ai_office_execution_claims (
  artifact_id uuid primary key references ai_office_artifacts(id) on delete cascade,
  status text not null default 'running',
  destination text,
  destination_id text,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ai_office_execution_claim_status_idx
  on ai_office_execution_claims(status, updated_at);

create index if not exists ai_office_workspace_mission_lookup_idx
  on ai_office_missions(workspace_id, created_at desc);

create index if not exists ai_office_workspace_artifact_lookup_idx
  on ai_office_artifacts(workspace_id, updated_at desc);
