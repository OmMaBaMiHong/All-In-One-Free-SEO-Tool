/**
 * Quality gate for factory-generated articles — the native rewrite of
 * the GEOFlow gate concept, scoped to what our scoring kernel can check
 * deterministically (no LLM at this stage):
 *
 * - adCompliance 30: 广告法绝对化用语黑名单(每处 -10)。广告合规是
 *   硬线:低于 25 直接拒绝,其余维度再高也不放行。
 * - evidenceCoverage 40: 召回证据的关键术语在文章中的覆盖率。生成时
 *   注入了证据,文章却没体现——说明模型没"吃"知识库。
 * - structure 30: FAQ 问句标题 / 答案前置 / 列表表格 / 篇幅。
 *
 * Verdict recomputed in code: total ≥ 70 且 adCompliance ≥ 25 → pass.
 * 与 GEU 的分工:GEU 管"改写没改坏原文"(对原文负责),本门禁管
 * "生成稿达到发布标准"(对知识库与广告法负责)。
 */

export interface GateDimension {
  score: number;
  max: number;
  issues: string[];
}

export interface QualityGateResult {
  total: number;
  verdict: "pass" | "reject";
  adCompliance: GateDimension;
  evidenceCoverage: GateDimension;
  structure: GateDimension;
}

/**
 * 广告法绝对化用语/虚假承诺黑名单。每条正则匹配一处计一次违规。
 * 这是广为公开的执法常识清单的自研实现,非任何项目的数据文件。
 */
export const AD_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /最好|最佳|最优|最强|最全|最先进|最专业|最高级|最低价/g, label: "「最」系绝对化用语" },
  { re: /第一名|销量第一|行业第一|全网第一|排名第一/g, label: "「第一」系排名承诺" },
  { re: /顶级|顶尖|极品|绝佳|王牌|冠军品质/g, label: "极限评价词" },
  { re: /独家|唯一|仅此一家|绝无仅有/g, label: "排他性表述" },
  { re: /绝对|百分之百有效|100%有效|永久有效|包治|包好/g, label: "绝对化承诺" },
  { re: /国家级|世界级|全网最低|史上最/g, label: "权威背书滥用" },
  { re: /无效退款|不满意退款|立竿见影|当天见效/g, label: "效果承诺" },
];

export function scanAdViolations(text: string): string[] {
  const found: string[] = [];
  for (const { re, label } of AD_PATTERNS) {
    const matches = text.match(new RegExp(re.source, "gi"));
    if (matches && matches.length > 0) {
      found.push(`${label}(«${matches[0]}»×${matches.length})`);
    }
  }
  return found;
}

/** Key terms from one evidence chunk (top CJK bigrams + latin words). */
export function keyEvidenceTerms(chunk: string, limit = 8): string[] {
  const freq = new Map<string, number>();
  for (const m of chunk.matchAll(/[\u4e00-\u9fff]{2,4}|[A-Za-z][A-Za-z0-9-]{2,}/g)) {
    const term = m[0];
    freq.set(term, (freq.get(term) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([t]) => t);
}

export function evidenceCoverage(
  article: string,
  knowledge: string[],
): GateDimension {
  const max = 40;
  if (knowledge.length === 0) {
    return { score: max, max, issues: ["无召回证据,覆盖项按满计"] };
  }
  const articleLower = article.toLowerCase();
  let covered = 0;
  const missing: string[] = [];
  for (const chunk of knowledge) {
    const terms = keyEvidenceTerms(chunk);
    if (terms.length === 0) continue;
    const hit = terms.filter((t) => articleLower.includes(t.toLowerCase()));
    const ratio = hit.length / terms.length;
    if (ratio >= 0.5) covered += 1;
    else missing.push(`证据「${chunk.slice(0, 24)}…」仅覆盖 ${hit.length}/${terms.length} 个关键术语`);
  }
  if (knowledge.length === 0) return { score: max, max, issues: [] };
  const score = Math.round((covered / knowledge.length) * max);
  return { score, max, issues: missing.slice(0, 5) };
}

export function structureScore(article: string): GateDimension {
  const issues: string[] = [];
  let score = 0;
  const headings = [...article.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1]);
  const qaHeadings = headings.filter((h) => /[?？]|如何|怎么|什么|为什么|哪/.test(h)).length;
  if (qaHeadings >= 2) score += 10;
  else { score += qaHeadings * 4; issues.push(`FAQ 式小节不足(${qaHeadings}/2)`); }

  const firstPara = article.split(/\n{2,}/).find((p) => !p.startsWith("#")) ?? "";
  if (firstPara.length >= 60) score += 10;
  else issues.push("首段过短,答案未前置");

  const lists = (article.match(/^(?:[-*]|\d+[.、])\s/gm) ?? []).length;
  if (lists >= 2) score += 5;
  else issues.push("列表/步骤少于 2 组");

  const textLen = article.replace(/[#>*`\-]/g, "").length;
  if (textLen >= 800 && textLen <= 3200) score += 5;
  else issues.push(`篇幅 ${textLen} 字(建议 800~3200 字)`);

  return { score: Math.min(30, score), max: 30, issues };
}

export function computeQualityGate(
  article: string,
  knowledge: string[],
): QualityGateResult {
  const adViolations = scanAdViolations(article);
  const adScore = Math.max(0, 30 - adViolations.length * 10);
  const adCompliance: GateDimension = {
    score: adScore,
    max: 30,
    issues: adViolations,
  };

  const coverage = evidenceCoverage(article, knowledge);
  const structure = structureScore(article);

  const total = adScore + coverage.score + structure.score;
  const verdict: "pass" | "reject" =
    total >= 70 && adCompliance.score >= 25 ? "pass" : "reject";

  return { total, verdict, adCompliance, evidenceCoverage: coverage, structure };
}
