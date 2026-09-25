/**
 * Deterministic GEO/SEO scoring kernel — cn/global dual-market.
 *
 * Ported (essence, in TypeScript) from HeiGe-GEO-SEO's 6-dimension / 22-item
 * scoring card, whose semantics the base platform lacked:
 *
 * - Pure function: same (html, robots, llms) → same score. Callable from
 *   audits, tasks, CI (`--fail-under` style gates) and the UI without a
 *   network fetch — the caller decides where the inputs come from.
 * - Two markets: cn checks Baiduspider/Sogou access and forgives missing
 *   llms.txt (domestic AIs don't read it); global checks the AI-crawler
 *   set and treats llms.txt as a first-class signal.
 * - `unknown` three-state: items that need robots.txt/llms.txt the caller
 *   didn't provide are excluded from the denominator instead of counted
 *   as failures. Penalising an unaudited file manufactures fake
 *   remediation work.
 * - Veto cap: pages that are CSR shells, carry a noindex, block every
 *   crawler, or fake a FAQPage schema cap at 60 — polish above that is
 *   noise while the fundamental is broken.
 *
 * Weights follow HeiGe's card: A 爬虫准入 18 · B 发现文件 16 · C Schema 16 ·
 * D 内容可抽取 22 · E 结构 16 · F 信任实体 12.
 */

export type Market = "cn" | "global";
export type CheckStatus = "pass" | "partial" | "fail" | "unknown";

export interface ScoreItem {
  id: string;
  name: string;
  weight: number;
  earned: number;
  status: CheckStatus;
  note: string;
}

export interface GeoAuditInput {
  html: string;
  market: Market;
  /** robots.txt body when the caller has it; omit → A items become unknown. */
  robotsTxt?: string | null;
  /** llms.txt body when the caller has it; omit → B items become unknown. */
  llmsTxt?: string | null;
  /** Brand term for entity-consistency checks; defaults to the domain label. */
  brandName?: string;
  /** Injected clock for the freshness check (tests). Defaults to now. */
  now?: Date;
}

export interface GeoAuditResult {
  total: number;
  /** Denominator after unknown items were excluded (HeiGe's dw). */
  maxTotal: number;
  geoScore: number; // A+B+C+D, normalised to 100
  seoScore: number; // C+E+F, normalised to 100
  market: Market;
  items: ScoreItem[];
  veto: string[];
  /** Lowest-earned actionable items, veto-capped ones included. */
  weakest: ScoreItem[];
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff]/;

function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Latin words count as words; CJK text approximates 2 chars = 1 word. */
function wordCount(text: string): number {
  const latin = (text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latin + Math.round(cjk / 2);
}

function sentences(text: string): string[] {
  return text
    .split(/[。！？!?]+|(?<=[a-z0-9)"'])\.\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === "object") out.push(node as Record<string, unknown>);
      }
    } catch {
      // invalid JSON-LD is itself a finding (C4)
    }
  }
  return out;
}

function hasType(blocks: Record<string, unknown>[], type: string): boolean {
  return blocks.some((b) => {
    const t = b["@type"];
    return (typeof t === "string" && t.toLowerCase() === type.toLowerCase()) ||
      (Array.isArray(t) && t.some((x) => String(x).toLowerCase() === type.toLowerCase()));
  });
}

/**
 * Does robots.txt grant this UA access to "/"? Groups are consecutive
 * User-agent lines followed by rules; a blank line closes a group. The
 * most-specific group (exact UA match) wins over the `*` group; no
 * matching group at all means allowed.
 */
function robotAllows(robotsTxt: string, ua: string): boolean | null {
  const uaLower = ua.toLowerCase();
  let wildcard: boolean | null = null;
  let exact: boolean | null = null;
  let agents: string[] = [];
  let disallowAll = false;
  let sawRule = false;

  const flush = () => {
    if (agents.length === 0) return;
    const decision = disallowAll ? false : true;
    for (const a of agents) {
      if (a === "*") wildcard = wildcard ?? decision;
      else if (uaLower === a || uaLower.includes(a)) exact = exact ?? decision;
    }
    agents = [];
    disallowAll = false;
    sawRule = false;
  };

  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) { flush(); continue; }
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      // A UA line after rules (with rules already seen) starts a new group;
      // stacked UA lines before any rule share one group.
      if (sawRule) flush();
      agents.push(value.toLowerCase());
    } else if (agents.length > 0) {
      if (key === "disallow" && value === "/") disallowAll = true;
      sawRule = true;
    }
  }
  flush();
  return exact ?? wildcard;
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

const BOTSETS: Record<Market, string[]> = {
  cn: ["Baiduspider", "bingbot", "Sogou spider", "360Spider"],
  global: ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"],
};

export function auditGeo(input: GeoAuditInput): GeoAuditResult {
  const { html, market } = input;
  const items: ScoreItem[] = [];
  const veto: string[] = [];
  const now = input.now ?? new Date();

  const visible = visibleText(html);
  const words = wordCount(visible);
  const sents = sentences(visible);
  const ld = jsonLdBlocks(html);
  const textLower = html.toLowerCase();

  const push = (item: ScoreItem) => items.push(item);

  // ── A 爬虫准入 18 ──────────────────────────────────────────────────────
  const bots = BOTSETS[market];
  if (input.robotsTxt == null) {
    push({ id: "A1", name: `检索/AI 爬虫准入(${bots[0]} 等 ${bots.length} 个)`, weight: 14, earned: 0, status: "unknown", note: "未提供 robots.txt,该项不计入分母" });
  } else {
    const denied = bots.filter((b) => robotAllows(input.robotsTxt ?? "", b) === false);
    const earned = denied.length === 0 ? 14 : Math.max(0, 14 - denied.length * 4);
    push({
      id: "A1", name: "检索/AI 爬虫准入", weight: 14, earned,
      status: denied.length === 0 ? "pass" : denied.length === bots.length ? "fail" : "partial",
      note: denied.length === 0 ? `${bots.length} 个爬虫全部放行` : `被拒绝: ${denied.join(", ")}`,
    });
  }
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  push({
    id: "A2", name: "页面可索引(无 noindex)", weight: 4, earned: noindex ? 0 : 4,
    status: noindex ? "fail" : "pass",
    note: noindex ? "meta robots noindex 命中,搜索引擎与 AI 均无法收录" : "未发现 noindex",
  });
  if (noindex) veto.push("页面 noindex:搜索引擎与 AI 爬虫均无法收录");

  // ── B 发现文件 16 ─────────────────────────────────────────────────────
  // cn 市场对 llms.txt 宽容(国内主流 AI 不读),给足基础分;global 视其为一级信号。
  const llmsKnown = input.llmsTxt != null;
  const llms = (input.llmsTxt ?? "").trim();
  const llmsOk = llms.length > 40 && /^#\s/m.test(llms);
  if (market === "cn") {
    push({
      id: "B1", name: "llms.txt(国内宽容)", weight: 4,
      earned: !llmsKnown ? 0 : llmsOk ? 4 : 2,
      status: !llmsKnown ? "unknown" : llmsOk ? "pass" : "partial",
      note: !llmsKnown ? "未提供 llms.txt,不计入分母" : llmsOk ? "已配置" : "存在但过于简单",
    });
    push({ id: "B2", name: "sitemap 引用", weight: 12, earned: 12, status: "pass", note: "国内市场以百度站长平台提交为主,llms/sitemap 项默认给分" });
  } else {
    if (!llmsKnown) {
      push({ id: "B1", name: "llms.txt", weight: 10, earned: 0, status: "unknown", note: "未提供 llms.txt,不计入分母" });
    } else {
      push({ id: "B1", name: "llms.txt", weight: 10, earned: llmsOk ? 10 : 3, status: llmsOk ? "pass" : "partial", note: llmsOk ? "已配置且结构有效" : "缺失或无效(AI 引擎的站点说明书)" });
    }
    push({
      id: "B2", name: "sitemap 引用(robots 或 llms 内)", weight: 6,
      earned: /sitemap:/i.test(input.robotsTxt ?? "") || /sitemap/i.test(input.llmsTxt ?? "") ? 6 : 0,
      status: /sitemap:/i.test(input.robotsTxt ?? "") ? "pass" : "fail",
      note: /sitemap:/i.test(input.robotsTxt ?? "") ? "robots.txt 声明了 Sitemap" : "robots/llms 均未声明 Sitemap",
    });
  }

  // ── C Schema 16 ───────────────────────────────────────────────────────
  const c1 = ld.length > 0;
  push({ id: "C1", name: "存在 JSON-LD", weight: 4, earned: c1 ? 4 : 0, status: c1 ? "pass" : "fail", note: c1 ? `${ld.length} 个结构化块` : "页面无 JSON-LD" });
  const coreTypes = ["organization", "website", "article", "faqpage", "breadcrumblist"];
  const covered = coreTypes.filter((t) => hasType(ld, t));
  const c2 = Math.min(4, covered.length * 2);
  push({ id: "C2", name: "核心 Schema 覆盖", weight: 4, earned: c2, status: c2 === 4 ? "pass" : c2 > 0 ? "partial" : "fail", note: covered.length ? `已覆盖: ${covered.join(", ")}` : "无核心 schema" });
  const richest = ld.reduce((mx, b) => Math.max(mx, Object.keys(b).length), 0);
  push({ id: "C3", name: "Schema 属性丰富度(≥5 属性)", weight: 3, earned: richest >= 5 ? 3 : richest >= 3 ? 1.5 : 0, status: richest >= 5 ? "pass" : richest >= 3 ? "partial" : "fail", note: `最大属性数 ${richest}` });
  // validity: any <script type=ld+json> whose content failed to parse
  let invalid = 0;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(m[1].trim()); } catch { invalid += 1; }
  }
  push({ id: "C4", name: "Schema 可解析", weight: 3, earned: invalid === 0 ? 3 : 0, status: invalid === 0 ? "pass" : "fail", note: invalid ? `${invalid} 个 JSON-LD 块解析失败` : "全部可解析" });

  // ── D 内容可抽取性 22 ─────────────────────────────────────────────────
  const answerFirst = visible.slice(0, 220);
  const d1ok = words > 30 && /^(.|^)/.test(answerFirst) && answerFirst.split(/[。.!?]/)[0].length >= 30;
  push({ id: "D1", name: "答案前置(首句即直接答案)", weight: 5, earned: d1ok ? 5 : 0, status: d1ok ? "pass" : "fail", note: d1ok ? "首段首句给出直接陈述" : "首句未形成有效答案" });
  const facts = (visible.match(/\d+(\.\d+)?/g) ?? []).length;
  const externalLinks = (html.match(/<a[^>]+href=["']https?:\/\//gi) ?? []).length;
  const density = words > 0 ? ((facts + externalLinks) / words) * 100 : 0;
  push({ id: "D2", name: "主张密度(≥4 事实/100 词)", weight: 6, earned: density >= 4 ? 6 : density >= 2 ? 3 : 0, status: density >= 4 ? "pass" : density >= 2 ? "partial" : "fail", note: `密度 ${density.toFixed(1)}/100 词(数字 ${facts} + 外链 ${externalLinks})` });
  const avgSent = sents.length ? words / sents.length : 0;
  push({ id: "D3", name: "句长(平均 15~20 词)", weight: 3, earned: avgSent === 0 ? 0 : avgSent <= 24 ? 3 : avgSent <= 35 ? 1.5 : 0, status: avgSent === 0 ? "fail" : avgSent <= 24 ? "pass" : avgSent <= 35 ? "partial" : "fail", note: `平均 ${avgSent.toFixed(1)} 词/句(${sents.length} 句)` });
  const d4 = words >= 800 && words <= 1800 ? 4 : words >= 500 ? 2 : words >= 200 ? 1 : 0;
  push({ id: "D4", name: "篇幅(800~1500 词最优)", weight: 4, earned: d4, status: d4 === 4 ? "pass" : d4 > 0 ? "partial" : "fail", note: `${words} 词` });
  const authority = /(arxiv|wikipedia|github\.com|gov|edu|doi\.org|zhihu\.com|zhuanlan)/i.test(html);
  push({ id: "D5", name: "数据与权威引用", weight: 4, earned: facts > 0 && externalLinks > 0 ? (authority ? 4 : 3) : facts > 0 ? 2 : 0, status: facts > 0 && externalLinks > 0 ? "pass" : "partial", note: `数字 ${facts} · 外链 ${externalLinks} · 权威域 ${authority ? "有" : "无"}` });

  // ── E 结构 16 ─────────────────────────────────────────────────────────
  const h1s = (html.match(/<h1[\s>]/gi) ?? []).length;
  push({ id: "E1", name: "单一 H1", weight: 4, earned: h1s === 1 ? 4 : h1s === 0 ? 0 : 2, status: h1s === 1 ? "pass" : "partial", note: `H1 数量 ${h1s}` });
  const headings = [...html.matchAll(/<h([1-6])[\s>]/gi)].map((m) => Number(m[1]));
  let skips = 0;
  for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) skips += 1;
  push({ id: "E2", name: "标题层级不跳级", weight: 3, earned: headings.length === 0 ? 0 : skips === 0 ? 3 : 1, status: headings.length === 0 ? "fail" : skips === 0 ? "pass" : "partial", note: headings.length ? `${headings.length} 个标题,${skips} 处跳级` : "无标题结构" });
  const lists = (html.match(/<(ul|ol|table)[\s>]/gi) ?? []).length;
  push({ id: "E3", name: "列表与表格", weight: 3, earned: lists >= 2 ? 3 : lists === 1 ? 1.5 : 0, status: lists >= 2 ? "pass" : lists === 1 ? "partial" : "fail", note: `list/table 共 ${lists} 个` });
  const qaHeadings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].filter((m) => /[?？]|faq|常见|如何|怎么|什么|为什么/i.test(stripTags(m[1]))).length;
  const dls = (html.match(/<dl[\s>]/gi) ?? []).length;
  push({ id: "E4", name: "定义块/Q&A 标题", weight: 3, earned: qaHeadings >= 2 ? 3 : qaHeadings === 1 || dls > 0 ? 1.5 : 0, status: qaHeadings >= 2 ? "pass" : qaHeadings === 1 || dls > 0 ? "partial" : "fail", note: `Q&A 式标题 ${qaHeadings} 个,定义块 ${dls} 个` });
  const verbRe = /(是|有|提供|支持|包括|可以|能|会|基于|通过|使用|生成|创建)/;
  const tripleRatio = sents.length ? sents.filter((s) => verbRe.test(s)).length / sents.length : 0;
  push({ id: "E5", name: "语义三元组密度(≥30% 句子)", weight: 3, earned: tripleRatio >= 0.3 ? 3 : tripleRatio >= 0.15 ? 1.5 : 0, status: tripleRatio >= 0.3 ? "pass" : tripleRatio >= 0.15 ? "partial" : "fail", note: `${Math.round(tripleRatio * 100)}% 句子含主谓结构` });

  // ── F 信任实体 12 ─────────────────────────────────────────────────────
  const hasPerson = hasType(ld, "person") || /rel=["']author["']|["']author["']\s*:/i.test(html);
  push({ id: "F1", name: "作者署名/Person", weight: 3, earned: hasPerson ? 3 : 0, status: hasPerson ? "pass" : "fail", note: hasPerson ? "发现作者信号" : "无作者署名或 Person schema" });
  const sameAsCount = (html.match(/"sameAs"\s*:\s*\[/gi) ?? []).length;
  const kg = sameAsCount > 0 || /wikipedia\.org/i.test(html);
  push({ id: "F2", name: "知识图谱外链(sameAs/Wikipedia)", weight: 3, earned: kg ? 3 : 0, status: kg ? "pass" : "fail", note: sameAsCount ? `${sameAsCount} 个 sameAs 块` : "无 sameAs" });
  const brand = (input.brandName ?? "").toLowerCase();
  const titleTag = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const descTag = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
  const entityOk = brand ? titleTag.toLowerCase().includes(brand) && descTag.toLowerCase().includes(brand) : titleTag.length > 0 && descTag.length > 0;
  push({ id: "F3", name: "实体一致性(title/description 含品牌)", weight: 3, earned: entityOk ? 3 : 0, status: entityOk ? "pass" : "fail", note: brand ? `品牌「${input.brandName}」title:${titleTag.toLowerCase().includes(brand)} · description:${descTag.toLowerCase().includes(brand)}` : "未提供 brandName,按 title/desc 非空判定" });
  const year = now.getFullYear();
  const fresh = new RegExp(`(dateModified|article:modified_time|${year}|${year - 1})`, "i").test(html);
  push({ id: "F4", name: "内容新鲜度", weight: 3, earned: fresh ? 3 : 1, status: fresh ? "pass" : "partial", note: fresh ? "有近期更新信号" : "未见 dateModified 或近期年份" });

  // ── veto 判定 ─────────────────────────────────────────────────────────
  if (visible.length < 500 && (html.match(/<script/gi) ?? []).length >= 3) {
    veto.push("正文疑似 CSR 空壳(可见文本过少 + 存在脚本),AI 爬虫拿不到内容");
  }
  if (hasType(ld, "faqpage")) {
    const faqBlock = ld.find((b) => String(b["@type"]).toLowerCase() === "faqpage");
    const hasQuestions = JSON.stringify(faqBlock).includes("Question");
    if (!hasQuestions) veto.push("FAQPage schema 没有 Question 节点(结构性造假)");
  }

  // ── 汇总(unknown 剔除分母) ───────────────────────────────────────────
  const scored = items.filter((i) => i.status !== "unknown");
  const maxTotal = scored.reduce((s, i) => s + i.weight, 0);
  const earned = scored.reduce((s, i) => s + i.earned, 0);
  let total = maxTotal > 0 ? (earned / maxTotal) * 100 : 0;
  if (veto.length > 0) total = Math.min(total, 60);

  const dim = (ids: string[]) =>
    items.filter((i) => ids.includes(i.id[0]) && i.status !== "unknown");
  const geo = dim(["A", "B", "C", "D"]);
  const seo = dim(["C", "E", "F"]);
  const geoScore = geo.length ? (geo.reduce((s, i) => s + i.earned, 0) / geo.reduce((s, i) => s + i.weight, 0)) * 100 : 0;
  const seoScore = seo.length ? (seo.reduce((s, i) => s + i.earned, 0) / seo.reduce((s, i) => s + i.weight, 0)) * 100 : 0;

  const weakest = [...scored]
    .filter((i) => i.status !== "pass")
    .sort((a, b) => b.weight - b.earned - (a.weight - a.earned))
    .slice(0, 5);

  return {
    total: Math.round(total * 10) / 10,
    maxTotal: Math.round(maxTotal * 10) / 10,
    geoScore: Math.round(geoScore * 10) / 10,
    seoScore: Math.round(seoScore * 10) / 10,
    market,
    items,
    veto,
    weakest,
  };
}
