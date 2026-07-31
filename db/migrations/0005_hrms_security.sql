-- HRMS authentication and session foundation.
-- Apply after 0001_initial.sql through 0004_ai_studio.sql.

create table if not exists hr_sessions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  role text not null check (role in ('hr_admin', 'manager', 'employee', 'finance')),
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists hr_sessions_user_idx on hr_sessions(user_id, expires_at desc);
create index if not exists hr_sessions_expiry_idx on hr_sessions(expires_at);

create table if not exists hr_login_attempts (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  identifier_hash text not null,
  ip_hash text not null,
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists hr_login_attempts_lookup_idx
  on hr_login_attempts(identifier_hash, ip_hash, created_at desc);

-- Existing team records remain valid. The first administrator is claimed through
-- /hr/login using HRMS_SETUP_KEY and receives credentials in users.metadata.auth.
