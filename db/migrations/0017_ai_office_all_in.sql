-- AI Office all-in schema: workspaces, artifacts, approvals, autonomy and learning.

create extension if not exists pgcrypto;

create table if not exists ai_office_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null default 'org-kretivco',
  customer_id text references customers(id) on delete set null,
  brand_id text references brands(id) on delete set null,
  name text not null,
  summary text,
  goals jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_id, brand_id)
);

alter table ai_office_missions add column if not exists workspace_id uuid references ai_office_workspaces(id) on delete set null;
alter table ai_office_missions add column if not exists parent_mission_id uuid references ai_office_missions(id) on delete set null;
alter table ai_office_missions add column if not exists budget_mode text not null default 'balanced';
alter table ai_office_missions add column if not exists quality_score numeric(5,2);
alter table ai_office_missions add column if not exists evaluation jsonb not null default '{}'::jsonb;
alter table ai_office_missions add column if not exists total_tokens integer not null default 0;
alter table ai_office_missions add column if not exists estimated_cost numeric(12,6) not null default 0;
alter table ai_office_missions add column if not exists execution_mode text not null default 'interactive';

alter table ai_office_tasks add column if not exists retry_count integer not null default 0;
alter table ai_office_tasks add column if not exists last_feedback text;
alter table ai_office_tasks add column if not exists stale boolean not null default false;

create table if not exists ai_office_artifacts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references ai_office_missions(id) on delete cascade,
  workspace_id uuid references ai_office_workspaces(id) on delete set null,
  agent_id text not null,
  artifact_type text not null,
  title text not null,
  content text not null,
  payload jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(5,2),
  status text not null default 'draft',
  destination text,
  destination_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_office_approvals (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references ai_office_missions(id) on delete cascade,
  artifact_id uuid references ai_office_artifacts(id) on delete cascade,
  action_key text not null default 'publish',
  title text not null,
  summary text,
  status text not null default 'pending',
  requested_by text not null default 'ai-office',
  resolved_by text,
  decision_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists ai_office_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null default 'org-kretivco',
  target_type text not null,
  target_id text not null,
  agent_id text,
  rating integer check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists ai_office_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references ai_office_missions(id) on delete cascade,
  workspace_id uuid references ai_office_workspaces(id) on delete set null,
  event_type text not null,
  actor text not null default 'system',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ai_office_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null default 'org-kretivco',
  workspace_id uuid references ai_office_workspaces(id) on delete set null,
  mission_id uuid references ai_office_missions(id) on delete set null,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_office_watchers (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null default 'org-kretivco',
  workspace_id uuid references ai_office_workspaces(id) on delete cascade,
  name text not null,
  mission_prompt text not null,
  cadence text not null default 'weekly',
  next_run_at timestamptz,
  last_run_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_office_workspace_customer_idx on ai_office_workspaces(organization_id, customer_id);
create index if not exists ai_office_mission_workspace_idx on ai_office_missions(workspace_id, created_at desc);
create index if not exists ai_office_artifact_mission_idx on ai_office_artifacts(mission_id, created_at desc);
create index if not exists ai_office_artifact_workspace_idx on ai_office_artifacts(workspace_id, updated_at desc);
create index if not exists ai_office_approval_status_idx on ai_office_approvals(status, created_at desc);
create index if not exists ai_office_feedback_target_idx on ai_office_feedback(target_type, target_id);
create index if not exists ai_office_event_workspace_idx on ai_office_events(workspace_id, created_at desc);
create index if not exists ai_office_job_queue_idx on ai_office_jobs(status, run_after);
create index if not exists ai_office_watcher_due_idx on ai_office_watchers(status, next_run_at);
