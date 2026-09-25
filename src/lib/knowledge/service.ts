/**
 * Unified knowledge base service — ONE store consumed by both engines:
 * - GEO content generation / rewrite: recalled chunks injected as evidence
 * - SEO briefs & audits: brand facts and product terminology from the same
 *   store (this is the "融合" directive: not a copy of GEOFlow's KB, the
 *   single source both sides read)
 *
 * DB I/O lives here; the scoring/chunking maths are pure modules (chunker,
 * recall) with their own tests. V1 recall is keyword-based over all chunks
 * (the corpus is small — hundreds of chunks); V2 adds vectors behind the
 * same recallKnowledge signature.
 */

import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  cfKnowledgeBases,
  cfKnowledgeChunks,
  cfLibKeywords,
  cfKeywordLibraries,
} from "../../db/schema";
import { chunkText } from "./chunker";
import { rankChunks } from "./recall";

export interface KnowledgeBaseSummary {
  id: number;
  name: string;
  description: string;
  chunkCount: number;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseSummary[]> {
  const bases = await db
    .select()
    .from(cfKnowledgeBases)
    .orderBy(asc(cfKnowledgeBases.id));
  const counts = await db
    .select({
      kbId: cfKnowledgeChunks.kbId,
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(cfKnowledgeChunks)
    .groupBy(cfKnowledgeChunks.kbId);
  const byKb = new Map(counts.map((c) => [c.kbId, c.n]));
  return bases.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    chunkCount: byKb.get(b.id) ?? 0,
  }));
}

/** Ingest markdown/text into a knowledge base (creates it when named new). */
export async function ingestKnowledge(opts: {
  kbName: string;
  description?: string;
  markdown: string;
}): Promise<{ kbId: number; chunks: number }> {
  const name = opts.kbName.trim();
  let [kb] = await db
    .select()
    .from(cfKnowledgeBases)
    .where(eq(cfKnowledgeBases.name, name))
    .limit(1);
  if (!kb) {
    [kb] = await db
      .insert(cfKnowledgeBases)
      .values({ name, description: opts.description ?? "" })
      .returning();
  }
  const chunks = chunkText(opts.markdown);
  if (chunks.length > 0) {
    await db.insert(cfKnowledgeChunks).values(
      chunks.map((c) => ({
        kbId: kb.id,
        chunkIndex: c.index,
        content: c.content,
        importedFrom: "manual",
      })),
    );
  }
  return { kbId: kb.id, chunks: chunks.length };
}

export interface RecalledChunk {
  id: number;
  kbId: number;
  kbName: string;
  content: string;
  score: number;
}

/** Keyword recall across all chunks, best-first. V2 swaps the internals. */
export async function recallKnowledge(
  query: string,
  limit = 5,
): Promise<RecalledChunk[]> {
  const rows = await db
    .select({
      id: cfKnowledgeChunks.id,
      kbId: cfKnowledgeChunks.kbId,
      content: cfKnowledgeChunks.content,
      kbName: cfKnowledgeBases.name,
    })
    .from(cfKnowledgeChunks)
    .innerJoin(cfKnowledgeBases, eq(cfKnowledgeChunks.kbId, cfKnowledgeBases.id));
  const ranked = rankChunks(
    rows.map((r) => ({ ...r, content: r.content })),
    query,
  );
  return ranked.slice(0, limit).map((s) => ({
    id: s.item.id,
    kbId: s.item.kbId,
    kbName: s.item.kbName,
    content: s.item.content,
    score: Math.round(s.score * 100) / 100,
  }));
}

/** Brand/product terms from keyword libraries — feeds brand tagging. */
export async function libraryKeywordTerms(limit = 60): Promise<string[]> {
  const rows = await db
    .select({ keyword: cfLibKeywords.keyword })
    .from(cfLibKeywords)
    .orderBy(asc(cfLibKeywords.id))
    .limit(limit);
  return rows.map((r) => r.keyword);
}
