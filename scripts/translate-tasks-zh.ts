/**
 * 一次性:把 tasks 表里的英文任务标题/描述经 DeepSeek 批量译成中文。
 * 用法:npx tsx scripts/translate-tasks-zh.ts
 * Key 来源:data.db 的 workspace_settings(api.deepseek)。
 */
import Database from "better-sqlite3";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const db = new Database(
  join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "data.db"),
  { timeout: 10_000 },
);

// key 是加密存储的(enc:v1),应用外解不开——从环境变量传入明文
const key = process.env.DEEPSEEK_KEY ?? "";
if (!key) {
  console.error("用法:DEEPSEEK_KEY=sk-xxx npx tsx scripts/translate-tasks-zh.ts");
  process.exit(1);
}

async function main() {
const rows = db
  .prepare("SELECT id, title, description FROM tasks WHERE title GLOB '*[a-zA-Z]*'")
  .all() as { id: number; title: string; description: string }[];
console.log(`待翻译 ${rows.length} 条`);

const update = db.prepare("UPDATE tasks SET title = ?, description = ? WHERE id = ?");

async function translateBatch(batch: { id: number; title: string; description: string }[]) {
  const payload = batch.map((r) => ({ id: r.id, title: r.title, description: r.description.slice(0, 400) }));
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            '你是 SEO 行业翻译。把给出的英文 SEO 任务标题与描述译成简体中文。要求:术语准确(canonical=规范化链接, sitemap=站点地图, schema=结构化数据),保持原义不增删。只输出 JSON 数组:[{"id":<原id>,"title":"中文标题","description":"中文描述"}]',
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      max_tokens: 4000,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices: { message: { content: string | null } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("empty content");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  return JSON.parse(raw.slice(start, end + 1)) as {
    id: number;
    title: string;
    description: string;
  }[];
}

const BATCH = 5;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  try {
    const out = await translateBatch(batch);
    for (const t of out) {
      const orig = batch.find((b) => b.id === t.id);
      if (!orig) continue;
      if (t.title && t.title !== orig.title) {
        update.run(t.title, t.description ?? orig.description, t.id);
      }
    }
    console.log(`批次 ${i / BATCH + 1}: ${out.length} 条已译`);
  } catch (err) {
    console.error(`批次失败:`, (err as Error).message);
  }
  await new Promise((r) => setTimeout(r, 1200));
}
console.log("完成");
db.close();
}
void main();
