-- Chunked, bilingual-safe knowledge retrieval.
-- Apply after 0001_initial.sql through 0005_hrms_security.sql.
--
-- Retrieval previously ranked whole `knowledge_entries` rows with a single
-- English tsvector, then truncated the winning document to its first 1200
-- characters. Two things went wrong with that:
--
--   1. A long MoU or proposal answers the question somewhere in the middle, and
--      the truncation threw exactly that part away.
--   2. `to_tsvector('english', ...)` stems English only. Kretivco's records are
--      bilingual, so "bayaran", "insentif" and "penghantaran" were never stemmed
--      and every Malay question fell through to a crude ILIKE scan.
--
-- Chunks are indexed three ways so each covers the others' blind spots: the
-- English vector for stemmed English, the `simple` vector for Malay and for
-- proper nouns the English dictionary mangles, and trigrams for typos and
-- partial words. lib/ai-context.ts fuses the three rankings.

create extension if not exists pg_trgm;

create table if not exists knowledge_chunks (
  id text primary key default gen_random_uuid()::text,
  entry_id text not null references knowledge_entries(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  chunk_index integer not null,
  -- The markdown heading path the chunk sits under, kept so a retrieved
  -- fragment can be shown (and cited) with the section it came from.
  heading text not null default '',
  content text not null,
  tsv_english tsvector generated always as (to_tsvector('english', coalesce(heading, '') || ' ' || coalesce(content, ''))) stored,
  tsv_simple tsvector generated always as (to_tsvector('simple', coalesce(heading, '') || ' ' || coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  unique (entry_id, chunk_index)
);

create index if not exists knowledge_chunks_entry_idx on knowledge_chunks(entry_id);
create index if not exists knowledge_chunks_english_idx on knowledge_chunks using gin(tsv_english);
create index if not exists knowledge_chunks_simple_idx on knowledge_chunks using gin(tsv_simple);
create index if not exists knowledge_chunks_trgm_idx on knowledge_chunks using gin(content gin_trgm_ops);

-- Entry titles are short and high-signal, so they get their own fuzzy index:
-- "chef amar" should still reach "MoU Kretivco × Chef Ammar v7".
create index if not exists knowledge_entries_title_trgm_idx on knowledge_entries using gin(title gin_trgm_ops);

-- Tracks which revision of an entry the chunks were built from, so the indexer
-- can skip entries that have not changed since their last pass.
alter table knowledge_entries add column if not exists indexed_at timestamptz;
