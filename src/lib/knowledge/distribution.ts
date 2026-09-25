/**
 * Platform adaptation builder — "one draft, many platform shapes".
 *
 * The channel's style profile (tone/wordCount/mustDo/mustAvoid/link_form)
 * is injected verbatim into the adaptation prompt — the same facts become
 * 知乎长文 / 公众号体 / CSDN 教程 / Medium story. Link policy follows the
 * channel's link_form: dofollow/plain-text channels get one contextual
 * link back to the source article; none/ugc channels get brand mention
 * only (hard rule, prevents per-platform bans).
 */

export interface ChannelProfile {
  name: string;
  platform_type: string;
  link_form: string;
  style: string; // JSON string from cf_channels.style
}

export function buildAdaptationMessages(opts: {
  articleTitle: string;
  articleMarkdown: string;
  sourceUrl: string;
  channel: ChannelProfile;
  knowledge: string[];
}): { system: string; user: string } {
  let styleInfo = "{}";
  try {
    styleInfo = JSON.stringify(JSON.parse(opts.channel.style));
  } catch {
    styleInfo = opts.channel.style || "{}";
  }

  const linkRule = ["dofollow", "plain-text"].includes(opts.channel.link_form)
    ? `在正文合适位置自然地加入 1 个指向原文的链接(${opts.sourceUrl}),锚文本用描述性短语,不要用"点击这里"。`
    : `该平台不允许/不建议放链接:只做品牌提及("焚诀 Skoob"),不加任何链接。`;

  const knowledge = opts.knowledge.length
    ? opts.knowledge.map((k, i) => `[证据 ${i + 1}] ${k}`).join("\n\n")
    : "(无)";

  const system = `你是平台内容改编专家。把一篇官网文章改编成指定平台的内容:事实完全一致,表达完全本地化。
只输出改写后的 Markdown 正文,不要解释。`;

  const user = `# 目标渠道
平台:${opts.channel.name}(${opts.channel.platform_type})
风格模板(必须遵守):${styleInfo}
链接策略:${linkRule}

# 原文(事实唯一来源)
"""
${opts.articleMarkdown.slice(0, 9000)}
"""

# 知识库证据(优先采用,不得矛盾)
${knowledge}

# 改写要求
1. 保持原文全部事实:数字/日期/产品名/结论原样保留,不发明新事实。
2. 按平台风格重写表达:语气、结构、开头方式按风格模板。
3. 输出 Markdown 正文,含平台惯例的小标题节奏。`;

  return { system, user };
}

/** Parse the LLM adaptation; guard against empty/refusal output. */
export function parseAdaptation(raw: string | null): { ok: boolean; markdown: string; reason?: string } {
  if (!raw || raw.trim().length < 200) {
    return { ok: false, markdown: "", reason: "模型返回为空或过短" };
  }
  return { ok: true, markdown: raw.trim() };
}
