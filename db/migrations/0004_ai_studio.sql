-- Shared AI Studio history, reusable prompts, saved outputs and usage telemetry.
-- Apply after 0001_initial.sql through 0003_business_idempotency.sql.

create table if not exists ai_conversations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  title text not null default 'New conversation',
  mode text not null default 'normal',
  model text,
  use_company_data boolean not null default true,
  use_cloud_rag boolean not null default true,
  use_tools boolean not null default true,
  city text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_organization_idx
  on ai_conversations(organization_id, updated_at desc);

create table if not exists ai_messages (
  id text primary key default gen_random_uuid()::text,
  conversation_id text not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  mode text,
  sources jsonb not null default '[]'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  reasoning text,
  feedback text check (feedback is null or feedback in ('up', 'down')),
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
  on ai_messages(conversation_id, created_at asc);

create table if not exists ai_saved_outputs (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  conversation_id text references ai_conversations(id) on delete set null,
  message_id text references ai_messages(id) on delete set null,
  customer_id text references customers(id) on delete set null,
  title text not null,
  output_type text not null default 'AI response',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_saved_outputs_organization_idx
  on ai_saved_outputs(organization_id, updated_at desc);

create table if not exists ai_prompt_templates (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  prompt text not null,
  mode text not null default 'normal',
  use_company_data boolean not null default true,
  use_cloud_rag boolean not null default true,
  use_tools boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_usage_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  conversation_id text references ai_conversations(id) on delete set null,
  message_id text references ai_messages(id) on delete set null,
  capability text not null default 'chat',
  model text,
  mode text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  latency_ms integer not null default 0,
  success boolean not null default true,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_organization_idx
  on ai_usage_events(organization_id, created_at desc);

drop trigger if exists ai_conversations_set_updated_at on ai_conversations;
create trigger ai_conversations_set_updated_at before update on ai_conversations
for each row execute function set_updated_at();

drop trigger if exists ai_saved_outputs_set_updated_at on ai_saved_outputs;
create trigger ai_saved_outputs_set_updated_at before update on ai_saved_outputs
for each row execute function set_updated_at();

drop trigger if exists ai_prompt_templates_set_updated_at on ai_prompt_templates;
create trigger ai_prompt_templates_set_updated_at before update on ai_prompt_templates
for each row execute function set_updated_at();

insert into ai_prompt_templates (
  id, organization_id, name, category, description, prompt,
  mode, use_company_data, use_cloud_rag, use_tools, is_system
)
values
  ('ai-template-daily-brief', 'org-kretivco', 'Daily business brief', 'Executive',
   'Surface the decisions and risks that matter today.',
   'Prepare today''s Kretivco executive brief. Prioritise cash, pipeline, delivery and pending approvals. Separate facts from recommendations and finish with the three most important actions.',
   'deep', true, true, false, true),
  ('ai-template-client-copilot', 'org-kretivco', 'Client next actions', 'Client',
   'Turn the live client record into a practical action list.',
   'Review the selected client''s current records and knowledge. Summarise the situation, identify missing information or risks, and recommend the next five actions in priority order.',
   'deep', true, true, false, true),
  ('ai-template-campaign', 'org-kretivco', 'Campaign direction', 'Marketing',
   'Develop a campaign direction grounded in the client and brand record.',
   'Create a commercially practical campaign direction for the selected client. Include the core insight, audience, offer, messaging, TOFU/MOFU/BOFU approach, content angles and success measures. Respect approved claims and avoid-list wording.',
   'deep', true, true, true, true),
  ('ai-template-follow-up', 'org-kretivco', 'Sales follow-up', 'Sales',
   'Draft a concise follow-up based on the opportunity context.',
   'Review the relevant opportunity and client context. Draft a natural, concise follow-up message and list the likely objection plus the recommended next step. Do not invent promises, dates or prices.',
   'normal', true, true, false, true),
  ('ai-template-research', 'org-kretivco', 'Current market research', 'Research',
   'Use the deployed web-search tool for current external context.',
   'Research the topic I provide using current web information. Give a concise findings summary, distinguish sourced facts from inference, and explain the practical implication for Kretivco.',
   'deep', true, true, true, true),
  ('ai-template-content', 'org-kretivco', 'Content batch', 'Creative',
   'Generate a connected batch of channel-ready content.',
   'Using the selected client and Brand DNA, create a one-week content batch with channel, funnel stage, hook, copy direction, CTA and production note. Keep the language natural and specific rather than generic AI copy.',
   'normal', true, true, false, true)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  prompt = excluded.prompt,
  mode = excluded.mode,
  use_company_data = excluded.use_company_data,
  use_cloud_rag = excluded.use_cloud_rag,
  use_tools = excluded.use_tools,
  is_system = excluded.is_system;
