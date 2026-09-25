/**
 * Rewrite-instruction compiler — the Phase 3 bridge between scoring and
 * fixing (ported from HeiGe-GEO-SEO's instruction compiler).
 *
 * The idea that makes this more than a to-do list: a deterministic score
 * knows WHICH check failed and by how much; a compiled instruction knows
 * WHAT an LLM should write, under WHICH constraints, with WHICH expected
 * lift — so any model (DeepSeek, GLM, Claude, whatever the user configured)
 * can execute it without GEO knowledge, and the anti-AI-flavor clause keeps
 * the fix from reading like AI slop.
 *
 * Two target classes:
 * - "content"       → handed to the rewrite LLM as writing instructions
 * - "infrastructure" → NOT prose work; routed to generators (robots.txt,
 *   llms.txt, schema injection). Included in the package so the operator
 *   sees the full remediation plan, marked 非内容改写.
 *
 * Lift numbers are the KDD'24 GEO paper's measured ranges as recorded in
 * our research notes; they are expectations, not guarantees.
 */

import type { GeoAuditResult, Market, ScoreItem } from "../geo-audit-kernel";

export interface RewriteInstruction {
  checkId: string;
  severity: "fail" | "partial";
  /** What it costs right now (weight − earned). Drives the ordering. */
  gap: number;
  geoMethod: string;
  /** KDD'24-measured lift, when the method has one. */
  expectedLift?: string;
  action: string;
  target: "content" | "infrastructure";
}

export interface RewritePackage {
  market: Market;
  engine: string;
  instructions: RewriteInstruction[];
  constraints: string[];
  antiAiClause: string;
  engineFork?: string;
  markdown: string;
}

type ActionEntry = {
  geoMethod: string;
  expectedLift?: string;
  action: string;
  target: "content" | "infrastructure";
};

/** One entry per audit-kernel check id — the compiler's single source of truth. */
const ACTION_MAP: Record<string, ActionEntry> = {
  A1: {
    geoMethod: "爬虫准入配置",
    action: "在 robots.txt 中为列出的爬虫显式添加 Allow 规则。这是基础设施修复,不是内容改写。",
    target: "infrastructure",
  },
  A2: {
    geoMethod: "解除索引封锁",
    action: "移除页面 <meta name=robots> 中的 noindex。这是基础设施修复。",
    target: "infrastructure",
  },
  B1: {
    geoMethod: "llms.txt 配置",
    action: "按站点结构生成 llms.txt(标题/摘要/关键页清单),部署在站点根路径。这是基础设施修复。",
    target: "infrastructure",
  },
  B2: {
    geoMethod: "Sitemap 声明",
    action: "在 robots.txt 添加 `Sitemap: <绝对地址>` 行。这是基础设施修复。",
    target: "infrastructure",
  },
  C1: {
    geoMethod: "结构化数据注入",
    action: "为页面生成并注入 JSON-LD:至少包含 WebSite 与 Organization 两个节点,字段填真实信息,不要占位符。",
    target: "infrastructure",
  },
  C2: {
    geoMethod: "核心 Schema 补全",
    action: "按页面类型补齐核心 schema:内容页用 Article(含 headline/dateModified/author),首页用 WebSite+Organization,问答区块用 FAQPage。缺哪个补哪个。",
    target: "infrastructure",
  },
  C3: {
    geoMethod: "Schema 丰富化",
    action: "把现有 JSON-LD 的关键属性补到 ≥5 个(如 name/url/description/dateModified/author/sameAs),空字段宁可删除也不要造假。",
    target: "infrastructure",
  },
  C4: {
    geoMethod: "Schema 修复",
    action: "修复无法解析的 JSON-LD 块(常见:尾逗号/单引号/未转义引号)。修完必须 JSON.parse 验证通过。",
    target: "infrastructure",
  },
  D1: {
    geoMethod: "答案前置",
    action: "把每个小节的第一句改写成对该小节标题的直接回答:一句完整陈述句,含关键事实,不写背景铺垫。全文开头 140 字内必须出现对页面主题的直接答案。",
    target: "content",
  },
  D2: {
    geoMethod: "统计数据加注",
    expectedLift: "论文实测 +33% 引用率",
    action: "每 100 词补充至少 4 个可抽取事实:具体数字(版本号/时间/数量/百分比)、命名实体、明确对比。素材不足的位置标 [需补真实数据],绝不编造。",
    target: "content",
  },
  D3: {
    geoMethod: "短句化",
    action: "把平均句长压到 15~20 词:长句拆分,每个句子只说一件事,删除嵌套从句与插入语。中文以 25~40 字为一句。",
    target: "content",
  },
  D4: {
    geoMethod: "篇幅校准",
    action: "把正文扩写或精简到 800~1500 词:扩写优先补可抽取事实与例子,精简优先删重复表述,不为凑字数注水。",
    target: "content",
  },
  D5: {
    geoMethod: "权威引用",
    expectedLift: "论文实测 +30% 引用率",
    action: "为关键论断补充 1~2 个权威来源链接(官方文档/论文/百科),并注明数据年份。只引用真实存在且可访问的页面。",
    target: "content",
  },
  E1: {
    geoMethod: "单一 H1",
    action: "确保页面只有一个 <h1>,其余标题降级为 h2/h3。",
    target: "content",
  },
  E2: {
    geoMethod: "标题层级修正",
    action: "消除标题跳级(如 h1 直接接 h3):逐级递进,同级标题保持并列关系。",
    target: "content",
  },
  E3: {
    geoMethod: "结构化排版",
    action: "把并列内容改写为列表或表格:步骤用有序列表,对比用表格,要素用无序列表。每张表格至少 2 列 3 行。",
    target: "content",
  },
  E4: {
    geoMethod: "FAQ 化",
    expectedLift: "实测带来 2.7x 引用率",
    action: "把内容改写成问答形态:至少 2 个小节标题改成用户会问的问句(以 ? / ? 结尾),每问紧跟一段 60~120 字的直接回答。",
    target: "content",
  },
  E5: {
    geoMethod: "主谓宾完整句",
    action: "把无主语或无谓语的句子改写为'谁-做什么-结果如何'的完整陈述,便于 AI 抽取为独立事实。",
    target: "content",
  },
  F1: {
    geoMethod: "作者署名",
    action: "为文章添加真实作者署名与一句话资质说明,并配 Person schema(name + url)。没有真实作者就署团队名,不虚构个人。",
    target: "content",
  },
  F2: {
    geoMethod: "知识图谱外链",
    action: "在 Organization schema 中添加 sameAs 数组,填品牌真实存在的外部档案页(GitHub/官方社媒/百科)。只填真实 URL。",
    target: "infrastructure",
  },
  F3: {
    geoMethod: "实体一致性",
    action: "让 <title> 与 meta description 都包含品牌名(用同一写法),全文品牌名写法统一,不混用别名。",
    target: "content",
  },
  F4: {
    geoMethod: "新鲜度信号",
    action: "添加或更新 dateModified(JSON-LD 与 meta article:modified_time),正文保留'截至 YYYY 年'式的时间锚点。",
    target: "infrastructure",
  },
};

const CONSTRAINTS = [
  "不改变任何事实:数字、时间、名称、结论一律保持原样;素材不足标 [需补真实数据],绝不编造",
  "不堆砌关键词:同一关键词每 100 词最多出现 2 次",
  "改写后篇幅相对原文 ±10%",
  "保留原文已有的列表/表格/schema 结构信号",
];

const ANTI_AI_CLAUSE =
  "反 AI 味约束:禁用'总之''综上所述''值得注意的是''在当今时代''随着…的发展'这类套话开头与收尾;不使用三段排比堆砌;过渡用具体信息衔接而不是空话;句式长短交错,允许出现口语化表达。";

/** Engine-specific tactics recorded in our research notes. */
const ENGINE_FORKS: Record<string, string> = {
  claude: "Claude 特化:正文末尾加一段显式的局限性说明(哪些场景不适用)——实测可提升约 1.7x 引用率。",
  豆包: "豆包特化:本文还需铺进今日头条/抖音生态——豆包拒绝无来源内容,发布时务必带权威来源链接。",
  deepseek: "DeepSeek 特化:回答偏好结构化清单,确保全文至少 3 个可直接摘录的要点段。",
  grok: "Grok 特化:内容需同步铺进 X 高互动帖;Grok 引用幻觉率高,别把它的转述当权威。",
  perplexity: "Perplexity 特化:它几乎每答必引,确保页面的标题与首段包含可被精确引用的短句。",
  通用: "未指定引擎:按上述通用约束执行即可。",
};

function gap(item: ScoreItem): number {
  return item.weight - item.earned;
}

/** Compile the weakest audit items into an executable rewrite package. */
export function compileRewriteInstructions(
  audit: Pick<GeoAuditResult, "items" | "market">,
  opts: { engine?: string } = {},
): RewritePackage {
  const engine = opts.engine ?? "通用";
  const actionable = audit.items
    .filter((i) => i.status === "fail" || i.status === "partial")
    .sort((a, b) => gap(b) - gap(a));

  const instructions: RewriteInstruction[] = actionable.map((item) => {
    const entry = ACTION_MAP[item.id];
    return {
      checkId: item.id,
      severity: item.status as "fail" | "partial",
      gap: Math.round(gap(item) * 10) / 10,
      geoMethod: entry?.geoMethod ?? "通用 GEO 优化",
      expectedLift: entry?.expectedLift,
      action:
        entry?.action ??
        `针对检查项 ${item.id}(${item.name})按 ${item.note} 进行整改。`,
      target: entry?.target ?? "content",
    };
  });

  const contentItems = instructions.filter((i) => i.target === "content");
  const engineFork = ENGINE_FORKS[engine] ?? ENGINE_FORKS["通用"];

  const markdown = [
    `# GEO 改写指令包(${audit.market === "cn" ? "中国市场" : "全球市场"} · 引擎:${engine})`,
    "",
    `共 ${instructions.length} 项整改:内容改写 ${contentItems.length} 项,基础设施 ${instructions.length - contentItems.length} 项。按缺口从大到小排序。`,
    "",
    ...instructions.map(
      (i) =>
        `## [${i.checkId}] ${i.geoMethod}${i.expectedLift ? `(预期提升 ${i.expectedLift})` : ""}\n\n` +
        `- 严重度: ${i.severity === "fail" ? "未通过" : "部分达标"} · 缺口 ${i.gap} 分 · 目标: ${i.target === "content" ? "内容改写" : "基础设施(非内容改写)"}\n` +
        `- 指令: ${i.action}`,
    ),
    "",
    "## 全局约束",
    ...CONSTRAINTS.map((c) => `- ${c}`),
    "",
    `## ${engineFork}`,
    "",
    `## ${ANTI_AI_CLAUSE}`,
  ].join("\n");

  return {
    market: audit.market,
    engine,
    instructions,
    constraints: CONSTRAINTS,
    antiAiClause: ANTI_AI_CLAUSE,
    engineFork,
    markdown,
  };
}
