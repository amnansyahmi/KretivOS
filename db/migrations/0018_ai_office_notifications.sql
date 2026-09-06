-- Supporting indexes for AI Office notification and learning workflows.
create index if not exists notifications_ai_office_idx on notifications(entity_type, entity_id, created_at desc);
create index if not exists ai_office_feedback_agent_idx on ai_office_feedback(agent_id, created_at desc);
create index if not exists ai_office_missions_quality_idx on ai_office_missions(quality_score desc nulls last, completed_at desc);
