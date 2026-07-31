/**
 * Splits knowledge entries into retrievable chunks and keeps the index current.
 *
 * Chunking is heading-aware rather than a blind character slice: Kretivco's
 * records are structured markdown (MoUs, proposals, brand guidelines), and the
 * heading a passage sits under is most of what makes it findable. Each chunk
 * therefore carries its heading path, which is indexed alongside the body and
 * shown with the citation.
 *
 * Everything here degrades quietly. If migration 0006 has not been applied the
 * chunk table is missing, indexing becomes a no-op, and retrieval falls back to
 * the entry-level search it used before.
 */

import { getDatabase } from "@/lib/db";

const ORGANIZATION_ID = "org-kretivco";

/** Roughly 900 characters keeps a chunk inside one idea while staying quotable. */
const TARGET_CHARS = 900;
const MAX_CHARS = 1400;
/** Carried between adjacent chunks so a sentence split across the seam still matches. */
const OVERLAP_CHARS = 160;

export type KnowledgeChunk = { index: number; heading: string; content: string };

const headingLevel = (line: string) => /^(#{1,6})\s+/.exec(line)?.[1].length ?? 0;

/** Builds "Parent › Child" from the open heading stack. */
function headingPath(stack: string[]) {
  return stack.filter(Boolean).join(" › ");
}

/**
 * Splits on paragraph boundaries, then on sentences, and only then mid-text.
 * A table or code block is kept whole where it fits, because half a table is
 * worse than no table.
 */
function splitBlock(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= MAX_CHARS) return [trimmed];

  const pieces: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };

  for (const paragraph of trimmed.split(/\n{2,}/)) {
    if (paragraph.length > MAX_CHARS) {
      flush();
      // Sentence-ish boundaries: a full stop followed by whitespace, or a newline.
      const sentences = paragraph.split(/(?<=[.!?])\s+|\n/);
      for (const sentence of sentences) {
        if (current.length + sentence.length + 1 > TARGET_CHARS) flush();
        // A single sentence longer than the ceiling is cut on width as a last resort.
        if (sentence.length > MAX_CHARS) {
          for (let at = 0; at < sentence.length; at += TARGET_CHARS) {
            pieces.push(sentence.slice(at, at + TARGET_CHARS).trim());
          }
          continue;
        }
        current = current ? `${current} ${sentence}` : sentence;
      }
      flush();
      continue;
    }

    if (current.length + paragraph.length + 2 > TARGET_CHARS) flush();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  flush();
  return pieces.filter(Boolean);
}

export function chunkMarkdown(content: string): KnowledgeChunk[] {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const sections: { heading: string; body: string[] }[] = [];
  const stack: string[] = [];
  let body: string[] = [];
  let heading = "";
  let inCode = false;

  const closeSection = () => {
    if (body.some((line) => line.trim())) sections.push({ heading, body });
    body = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) inCode = !inCode;

    const level = inCode ? 0 : headingLevel(line);
    if (level) {
      closeSection();
      stack.length = Math.max(0, level - 1);
      stack[level - 1] = line.replace(/^#{1,6}\s+/, "").trim();
      heading = headingPath(stack);
      continue;
    }
    body.push(line);
  }
  closeSection();

  const chunks: KnowledgeChunk[] = [];
  for (const section of sections) {
    const pieces = splitBlock(section.body.join("\n"));
    pieces.forEach((piece, position) => {
      // Overlap only applies inside a section; across a heading the context
      // genuinely changes and bleeding text over would blur the boundary.
      const previous = position > 0 ? pieces[position - 1].slice(-OVERLAP_CHARS) : "";
      chunks.push({
        index: chunks.length,
        heading: section.heading,
        content: previous ? `…${previous}\n\n${piece}` : piece,
      });
    });
  }

  // An entry with no headings and no body still needs one searchable row.
  if (!chunks.length) {
    const fallback = String(content ?? "").trim();
    if (fallback) chunks.push({ index: 0, heading: "", content: fallback.slice(0, MAX_CHARS) });
  }

  return chunks;
}

const missingChunkTable = (error: unknown) =>
  error instanceof Error && /knowledge_chunks|pg_trgm|indexed_at/i.test(error.message);

/** Rebuilds the chunks for one entry. Safe to call on every write. */
export async function indexKnowledgeEntry(entryId: string, content: string) {
  try {
    const sql = getDatabase();
    const chunks = chunkMarkdown(content);

    await sql`delete from knowledge_chunks where entry_id = ${entryId}`;
    for (const chunk of chunks) {
      await sql`
        insert into knowledge_chunks (entry_id, organization_id, chunk_index, heading, content)
        values (${entryId}, ${ORGANIZATION_ID}, ${chunk.index}, ${chunk.heading}, ${chunk.content})
        on conflict (entry_id, chunk_index) do update set heading = excluded.heading, content = excluded.content
      `;
    }
    await sql`update knowledge_entries set indexed_at = now() where id = ${entryId}`;
    return chunks.length;
  } catch (error) {
    if (missingChunkTable(error)) return 0; // Migration 0006 not applied yet.
    console.error("Knowledge chunk indexing failed", error);
    return 0;
  }
}

export async function removeKnowledgeIndex(entryId: string) {
  try {
    await getDatabase()`delete from knowledge_chunks where entry_id = ${entryId}`;
  } catch (error) {
    if (!missingChunkTable(error)) console.error("Knowledge chunk removal failed", error);
  }
}

/**
 * Indexes every entry whose chunks are missing or older than its last edit.
 * Called opportunistically when the library is listed, so an existing database
 * becomes searchable without a manual backfill step.
 */
export async function indexStaleEntries(limit = 25) {
  try {
    const sql = getDatabase();
    const rows = await sql`
      select id, content from knowledge_entries
      where organization_id = ${ORGANIZATION_ID}
        and (indexed_at is null or indexed_at < updated_at)
      order by updated_at desc
      limit ${limit}
    `;
    for (const row of rows) await indexKnowledgeEntry(String(row.id), String(row.content ?? ""));
    return rows.length;
  } catch (error) {
    if (missingChunkTable(error)) return 0;
    console.error("Knowledge backfill failed", error);
    return 0;
  }
}
