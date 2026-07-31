-- Prevent server actions from creating duplicate finance records for the same source.

create unique index if not exists finance_transactions_source_unique
on finance_transactions (source_type, source_id)
where source_type is not null and source_id is not null;

create index if not exists contacts_customer_idx on contacts(customer_id);
create index if not exists brands_customer_idx on brands(customer_id);
create index if not exists projects_customer_idx on projects(customer_id);
create index if not exists onboardings_customer_idx on onboardings(customer_id);
create index if not exists onboarding_steps_onboarding_idx on onboarding_steps(onboarding_id, sort_order);
