-- Web push subscriptions.
--
-- Notifications existed only inside the app: the bell and the Inbox tab read
-- rows out of `notifications` whenever somebody happened to open the page.
-- Leave that was approved on Friday afternoon was found out about on Monday.
--
-- One row per device rather than per person. Somebody installs the HR app on a
-- phone and a tablet and expects both to buzz, and a subscription is issued by
-- the browser to a specific install — it cannot be moved or shared. The
-- endpoint is unique because it *is* the address the push service routes on,
-- so re-subscribing the same install updates rather than duplicates.
--
-- Deleted with the user, because a subscription that outlives the employee is
-- a push to a phone that should have stopped hearing from us.

create table if not exists push_subscriptions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  -- The push service URL. Long: Apple's run to several hundred characters.
  endpoint text not null unique,
  -- The keys the payload is encrypted to. Without them a push can only be sent
  -- empty, which iOS will not display.
  p256dh text not null,
  auth text not null,
  -- What created it, so a stale subscription can be recognised in a log.
  user_agent text,
  created_at timestamptz not null default now(),
  -- Touched on every successful send, so dead installs are identifiable.
  last_used_at timestamptz,
  -- Consecutive failures. A push service returning 404 or 410 means the
  -- subscription is gone for good and the row is deleted; anything else is
  -- counted, because one timeout is not proof of anything.
  failure_count integer not null default 0
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (organization_id, user_id);
