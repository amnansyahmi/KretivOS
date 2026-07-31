-- Moves the Content Planner and the financial projection scenario off the
-- browser and into the shared record.
-- Apply after 0001_initial.sql through 0006_knowledge_chunks.sql.
--
-- Both were held in localStorage, so every team member saw a different content
-- calendar and a different set of projection assumptions, and neither survived
-- clearing site data. They are planning artefacts the team is meant to agree on,
-- which makes per-device storage the wrong place for them.

create table if not exists planner_entries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  -- One slot per calendar day, which is how the planner grid is addressed.
  slot_date date not null,
  title text not null,
  channel text not null default '',
  status text not null default 'Planned' check (status in ('Planned', 'Review', 'Approved')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slot_date)
);

create index if not exists planner_entries_date_idx on planner_entries(organization_id, slot_date);

create table if not exists projection_scenarios (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null default 'Chef Ammar 12-month scenario',
  -- Percentage of total income retained by the company, 0-100.
  company_pct numeric(5,2) not null default 10,
  members integer not null default 5 check (members between 1 and 50),
  total_fees numeric(14,2) not null default 572000,
  total_incentive numeric(14,2) not null default 150700,
  -- The month-by-month rows, kept as JSON so the shape can change without a
  -- migration. This is a forecast, never reconciled against actual sales.
  rows jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one scenario is the one the dashboard opens.
create unique index if not exists projection_scenarios_default_idx
  on projection_scenarios(organization_id) where is_default;

drop trigger if exists planner_entries_set_updated_at on planner_entries;
create trigger planner_entries_set_updated_at before update on planner_entries
for each row execute function set_updated_at();

drop trigger if exists projection_scenarios_set_updated_at on projection_scenarios;
create trigger projection_scenarios_set_updated_at before update on projection_scenarios
for each row execute function set_updated_at();

insert into projection_scenarios (id, organization_id, name, company_pct, members, is_default)
values ('projection-chef-ammar', 'org-kretivco', 'Chef Ammar 12-month scenario', 10, 5, true)
on conflict (id) do nothing;
