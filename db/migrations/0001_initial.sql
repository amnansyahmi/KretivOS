-- KretivOS initial PostgreSQL schema
-- Run this file once in the Neon SQL Editor before enabling database-backed modules.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  email text not null,
  display_name text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists customers (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  legal_name text,
  industry text,
  status text not null default 'Lead',
  primary_contact_name text,
  email text,
  phone text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_organization_idx on customers(organization_id);
create index if not exists customers_status_idx on customers(status);
create index if not exists customers_industry_idx on customers(industry);

create table if not exists brands (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'Active',
  website_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, name)
);

create table if not exists contacts (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  name text not null,
  job_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing_channels (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  category text not null,
  status text not null default 'Active',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists customer_marketing_channels (
  customer_id text not null references customers(id) on delete cascade,
  marketing_channel_id text not null references marketing_channels(id) on delete cascade,
  handle_or_account text,
  url text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  primary key (customer_id, marketing_channel_id)
);

create table if not exists brand_dna_profiles (
  id text primary key default gen_random_uuid()::text,
  brand_id text not null references brands(id) on delete cascade,
  status text not null default 'Draft',
  positioning text,
  audience text,
  personality text,
  voice text,
  messaging jsonb not null default '{}'::jsonb,
  colours jsonb not null default '[]'::jsonb,
  typography jsonb not null default '{}'::jsonb,
  photography_direction text,
  approved_claims jsonb not null default '[]'::jsonb,
  avoid_list jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  ai_suggestions jsonb not null default '[]'::jsonb,
  completeness_score integer not null default 0,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists opportunities (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  title text not null,
  stage text not null default 'New',
  value numeric(14,2) not null default 0,
  probability integer not null default 0,
  next_action text,
  due_date date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_customer_idx on opportunities(customer_id);
create index if not exists opportunities_stage_idx on opportunities(stage);

create table if not exists sales_documents (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  type text not null,
  title text not null,
  reference text,
  status text not null default 'Draft',
  value numeric(14,2) not null default 0,
  issue_date date,
  due_date date,
  notes text,
  content jsonb not null default '{}'::jsonb,
  generated_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_documents_customer_idx on sales_documents(customer_id);
create index if not exists sales_documents_status_idx on sales_documents(status);

create table if not exists finance_transactions (
  id text primary key default gen_random_uuid()::text,
  customer_id text references customers(id) on delete set null,
  type text not null,
  category text not null,
  amount numeric(14,2) not null default 0,
  transaction_date date not null,
  status text not null default 'Pending',
  reference text,
  notes text,
  source_type text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_transactions_customer_idx on finance_transactions(customer_id);
create index if not exists finance_transactions_date_idx on finance_transactions(transaction_date);

create table if not exists financial_scenarios (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  name text not null,
  contract_version text,
  effective_from date,
  effective_to date,
  status text not null default 'Draft',
  assumptions jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financial_scenario_periods (
  id text primary key default gen_random_uuid()::text,
  scenario_id text not null references financial_scenarios(id) on delete cascade,
  period_index integer not null,
  period_label text not null,
  projected_units numeric(14,2) not null default 0,
  projected_revenue numeric(14,2) not null default 0,
  projected_incentive numeric(14,2) not null default 0,
  company_share numeric(14,2) not null default 0,
  team_share numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  unique (scenario_id, period_index)
);

create table if not exists settlements (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  units numeric(14,2) not null default 0,
  fee_per_unit numeric(14,4) not null default 0,
  ad_reimbursement numeric(14,2) not null default 0,
  incentive numeric(14,2) not null default 0,
  status text not null default 'Draft',
  due_date date,
  notes text,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists settlements_customer_idx on settlements(customer_id);
create index if not exists settlements_period_idx on settlements(period_start, period_end);

create table if not exists projects (
  id text primary key default gen_random_uuid()::text,
  customer_id text references customers(id) on delete set null,
  name text not null,
  status text not null default 'Planning',
  progress integer not null default 0,
  budget numeric(14,2) not null default 0,
  due_date date,
  owner text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_tasks (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'To do',
  priority text not null default 'Normal',
  assignee text,
  due_date date,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists onboardings (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  blueprint text not null,
  status text not null default 'Not started',
  target_launch date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists onboarding_steps (
  id text primary key default gen_random_uuid()::text,
  onboarding_id text not null references onboardings(id) on delete cascade,
  label text not null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funnels (
  id text primary key default gen_random_uuid()::text,
  customer_id text not null references customers(id) on delete cascade,
  brand_id text references brands(id) on delete set null,
  playbook_key text,
  name text not null,
  objective text not null,
  audience text,
  offer text,
  summary text,
  status text not null default 'Draft',
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funnel_stages (
  id text primary key default gen_random_uuid()::text,
  funnel_id text not null references funnels(id) on delete cascade,
  stage_key text not null,
  title text not null,
  objective text,
  kpi text,
  sort_order integer not null default 0,
  unique (funnel_id, stage_key)
);

create table if not exists funnel_activities (
  id text primary key default gen_random_uuid()::text,
  funnel_stage_id text not null references funnel_stages(id) on delete cascade,
  title text not null,
  format text,
  cta text,
  content_template_id text,
  marketing_channel_ids jsonb not null default '[]'::jsonb,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'Draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_templates (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  stage_key text,
  format text,
  channel_category text,
  description text,
  structure jsonb not null default '{}'::jsonb,
  content text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_entries (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  customer_id text references customers(id) on delete cascade,
  brand_id text references brands(id) on delete cascade,
  title text not null,
  filename text,
  category text not null default 'General',
  tags text[] not null default '{}'::text[],
  content text not null,
  source text not null default 'editor',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_entries_customer_idx on knowledge_entries(customer_id);
create index if not exists knowledge_entries_search_idx on knowledge_entries using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

create table if not exists document_templates (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  layout_key text not null default 'clean-document',
  content text not null,
  variables jsonb not null default '[]'::jsonb,
  brand_settings jsonb not null default '{}'::jsonb,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists generated_documents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  template_id text references document_templates(id) on delete set null,
  title text not null,
  document_type text,
  reference text,
  status text not null default 'Draft',
  field_values jsonb not null default '{}'::jsonb,
  brand_settings jsonb not null default '{}'::jsonb,
  rendered_html text,
  rendered_markdown text,
  pdf_url text,
  word_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assets (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  customer_id text references customers(id) on delete cascade,
  brand_id text references brands(id) on delete cascade,
  name text not null,
  asset_type text not null,
  category text,
  storage_url text not null,
  thumbnail_url text,
  mime_type text,
  file_size bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists automation_recipes (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  workspace text not null,
  trigger_key text not null,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'Active',
  approval_required boolean not null default false,
  is_system boolean not null default false,
  run_count integer not null default 0,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists automation_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  trigger_key text not null,
  entity_type text,
  entity_id text,
  source text not null default 'detected',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists automation_runs (
  id text primary key default gen_random_uuid()::text,
  recipe_id text references automation_recipes(id) on delete set null,
  event_id text references automation_events(id) on delete set null,
  status text not null,
  actions jsonb not null default '[]'::jsonb,
  summary text,
  error text,
  idempotency_key text unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists automation_approvals (
  id text primary key default gen_random_uuid()::text,
  recipe_id text references automation_recipes(id) on delete cascade,
  event_id text references automation_events(id) on delete cascade,
  status text not null default 'Pending',
  requested_by text,
  resolved_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists notifications (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info',
  status text not null default 'Unread',
  entity_type text,
  entity_id text,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists audit_logs (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workspace_state (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  scope text not null,
  version integer not null default 1,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope)
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'users', 'customers', 'brands', 'contacts',
    'marketing_channels', 'brand_dna_profiles', 'opportunities',
    'sales_documents', 'finance_transactions', 'financial_scenarios',
    'settlements', 'projects', 'project_tasks', 'onboardings',
    'onboarding_steps', 'funnels', 'funnel_activities', 'content_templates',
    'knowledge_entries', 'document_templates', 'generated_documents',
    'assets', 'automation_recipes', 'workspace_state'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on %I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

insert into organizations (id, name, slug)
values ('org-kretivco', 'Kretivco', 'kretivco')
on conflict (id) do nothing;
