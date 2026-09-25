/** 一次性:把两份官方文档灌进统一知识库(与 GEOFlow 迁移的 KB 同名追加切片)。 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestKnowledge } from "../src/lib/knowledge/service";

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), "/Users/wade/Downloads/seo-geo-work/geoflow-migration");
const docs: [string, string][] = [
  ["焚诀 Skoob 产品手册知识库", "geoflow-kb-product-manual.txt"],
  ["焚诀 Skoob 用户指南", "geoflow-kb-user-guide.txt"],
];
async function main() {
  for (const [kbName, file] of docs) {
    const md = readFileSync(resolve(BASE, file), "utf8");
    const r = await ingestKnowledge({ kbName, description: "官方文档(预渲染页提取)", markdown: md });
    console.log(`${kbName}: +${r.chunks} 切片`);
  }
}
void main();
