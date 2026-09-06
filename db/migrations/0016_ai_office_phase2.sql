create table if not exists ai_office_missions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null default 'org-kretivco',
  title text not null,
  mission text not null,
  mission_type text,
  objective text,
  summary text,
  status text not null default 'planning' check (status in ('planning','running','waiting_input','completed','failed')),
  grounded boolean not null default false,
  source_count integer not null default 0,
  qa_output text,
  final_output text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists ai_office_tasks (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references ai_office_missions(id) on delete cascade,
  task_key text not null,
  agent_id text not null,
  title text not null,
  instruction text not null,
  depends_on jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued','working','waiting_input','completed','failed','blocked')),
  output text,
  input_request text,
  human_input text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(mission_id, task_key)
);

create table if not exists ai_office_agent_runs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references ai_office_missions(id) on delete cascade,
  task_id uuid references ai_office_tasks(id) on delete cascade,
  agent_id text not null,
  status text not null,
  detail text,
  output text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_office_missions_created_idx on ai_office_missions(organization_id, created_at desc);
create index if not exists ai_office_tasks_mission_idx on ai_office_tasks(mission_id, status);
create index if not exists ai_office_runs_mission_idx on ai_office_agent_runs(mission_id, created_at);
