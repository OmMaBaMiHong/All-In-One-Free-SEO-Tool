/**
 * One-shot import: GEOFlow PostgreSQL export (geoflow-migration/*.json)
 * → our SQLite content-factory tables. Run once; idempotency is by
 * unique imported names (re-running duplicates rows by design — drop
 * the cf_* tables first if you need a clean re-import).
 *
 * Usage: npx tsx scripts/import-geoflow-migration.ts <jsonDir>
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "../geoflow-migration");
const db = new Database(join(__dirname, "../data.db"), { timeout: 10_000 });

function loadJson<T>(name: string): T[] {
  return JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as T[];
}

const now = () => Math.floor(Date.now() / 1000);

const insertKb = db.prepare(
  "INSERT INTO cf_knowledge_bases (name, description, created_at) VALUES (?, ?, ?)",
);
const insertChunk = db.prepare(
  "INSERT INTO cf_knowledge_chunks (kb_id, chunk_index, content, imported_from) VALUES (?, ?, ?, 'geoflow')",
);
const insertTitleLib = db.prepare("INSERT INTO cf_title_libraries (name) VALUES (?)");
const insertTitle = db.prepare(
  "INSERT INTO cf_titles (library_id, title) VALUES (?, ?)",
);
const insertKwLib = db.prepare("INSERT INTO cf_keyword_libraries (name) VALUES (?)");
const insertKw = db.prepare(
  "INSERT INTO cf_lib_keywords (library_id, keyword) VALUES (?, ?)",
);
const insertPrompt = db.prepare(
  "INSERT INTO cf_prompts (name, kind, content, variables) VALUES (?, ?, ?, ?)",
);
const insertArticle = db.prepare(
  "INSERT INTO cf_articles (title, content_md, status, source, created_at) VALUES (?, ?, ?, 'geoflow', ?)",
);
const insertAuthor = db.prepare("INSERT INTO cf_authors (name) VALUES (?)");

const importAll = db.transaction(() => {
  // knowledge bases + chunks
  const kbIds = new Map<number, number>();
  for (const kb of loadJson<{ id: number; name: string; description: string }>(
    "knowledge_bases",
  )) {
    const r = insertKb.run(kb.name, kb.description, now());
    kbIds.set(kb.id, Number(r.lastInsertRowid));
  }
  for (const ch of loadJson<{
    id: number;
    knowledge_base_id: number;
    chunk_index: number;
    content: string;
  }>("knowledge_chunks")) {
    const kbId = kbIds.get(ch.knowledge_base_id);
    if (kbId) insertChunk.run(kbId, ch.chunk_index, ch.content);
  }

  // keyword libraries + keywords
  const kwLibIds = new Map<number, number>();
  for (const lib of loadJson<{ id: number; name: string }>("keyword_libraries")) {
    const r = insertKwLib.run(lib.name);
    kwLibIds.set(lib.id, Number(r.lastInsertRowid));
  }
  for (const kw of loadJson<{
    id: number;
    library_id: number;
    keyword: string;
  }>("keywords")) {
    const libId = kwLibIds.get(kw.library_id);
    if (libId) insertKw.run(libId, kw.keyword);
  }

  // title libraries + titles
  const titleLibIds = new Map<number, number>();
  for (const lib of loadJson<{ id: number; name: string }>("title_libraries")) {
    const r = insertTitleLib.run(lib.name);
    titleLibIds.set(lib.id, Number(r.lastInsertRowid));
  }
  for (const t of loadJson<{
    id: number;
    library_id: number;
    title: string;
  }>("titles")) {
    const libId = titleLibIds.get(t.library_id);
    if (libId) insertTitle.run(libId, t.title);
  }

  // prompts
  for (const p of loadJson<{
    id: number;
    name: string;
    type: string;
    content: string;
    variables: string;
  }>("prompts")) {
    insertPrompt.run(p.name, p.type, p.content, p.variables);
  }

  // articles
  for (const a of loadJson<{
    id: number;
    title: string;
    content: string;
    status: string;
  }>("articles")) {
    insertArticle.run(a.title, a.content, a.status, now());
  }

  // authors
  for (const a of loadJson<{ id: number; name: string }>("authors")) {
    insertAuthor.run(a.name);
  }
});

importAll();

const counts = db
  .prepare(
    `SELECT 'kb' t, COUNT(*) n FROM cf_knowledge_bases
     UNION ALL SELECT 'chunks', COUNT(*) FROM cf_knowledge_chunks
     UNION ALL SELECT 'kw_libs', COUNT(*) FROM cf_keyword_libraries
     UNION ALL SELECT 'kw', COUNT(*) FROM cf_lib_keywords
     UNION ALL SELECT 'title_libs', COUNT(*) FROM cf_title_libraries
     UNION ALL SELECT 'titles', COUNT(*) FROM cf_titles
     UNION ALL SELECT 'prompts', COUNT(*) FROM cf_prompts
     UNION ALL SELECT 'articles', COUNT(*) FROM cf_articles
     UNION ALL SELECT 'authors', COUNT(*) FROM cf_authors`,
  )
  .all() as { t: string; n: number }[];
console.log("导入完成:", counts.map((c) => `${c.t}=${c.n}`).join(" · "));
db.close();
