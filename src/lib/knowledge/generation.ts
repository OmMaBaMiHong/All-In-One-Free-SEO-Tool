/**
 * Content generation (native rewrite of GEOFlow's production core).
 *
 * Flow: pick an unused title from a library → recall knowledge for it →
 * build generation messages (evidence + GEO writing rules) → any LLM.
 *
 * The prompt encodes the same rules the scoring kernel grades on —
 * 答案前置、事实密度、短句、FAQ 小节、反 AI 味 — so generation is
 * born passing the checks instead of being fixed afterwards.
 */

export interface LibraryTitle {
  id: number;
  title: string;
  used: number;
}

/** First unused titles, in order. */
export function pickUnusedTitles(titles: LibraryTitle[], count = 1): LibraryTitle[] {
  return titles.filter((t) => !t.used).slice(0, count);
}

export function buildGenerationMessages(opts: {
  title: string;
  knowledge: string[];
  targetWords?: number;
}): { system: string; user: string } {
  const target = opts.targetWords ?? 1200;
  const knowledge = opts.knowledge.length
    ? opts.knowledge.map((k, i) => `[证据 ${i + 1}] ${k}`).join("\n\n")
    : "(本次未召回知识库证据——只写通用方法论,不得出现具体产品事实)";
  const system = `你是一名 GEO 内容写手:为"AI 搜索引用"而写,不是为搜索引擎关键词堆砌而写。

硬规则(评分内核会逐条检查):
1. 答案前置:文章第一句直接回答标题问题,140 字内给出完整答案。
2. 事实密度:每 100 词至少 4 个可抽取事实(具体数字/命名实体/明确对比)。知识库证据里的数字必须原样采用,不得改动。
3. 短句:平均每句 15~20 词(中文 25~40 字),一句只说一件事。
4. FAQ 结构:至少 2 个小节标题是用户会问的问句(以?结尾),每问紧跟 60~120 字直接回答。
5. 完整结构:单一 H1(即标题),H2/H3 逐级递进,并列内容用列表或表格。
6. 反 AI 味:禁用"总之/综上所述/值得注意的是/在当今时代"开头收尾;不三段排比;句式长短交错。
7. 不编造:证据中没有的事实不得发明;素材不足写通用方法论,不虚构产品细节。

篇幅:正文 ${target} 字左右(±15%)。语言:简体中文。
输出:只输出 Markdown 正文(以 H1 开头),不要任何解释。`;

  const user = `标题(即 H1):${opts.title}

知识库证据(优先采用,数字与表述保持原样):
${knowledge}

按硬规则写出全文。`;

  return { system, user };
}
