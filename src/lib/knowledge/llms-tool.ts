/**
 * llms.txt 生成器核心逻辑(纯函数,可测)。
 *
 * 规范:llmstxt.org —— H1 项目名(必需)→ blockquote 摘要 → H2 章节
 * (内含链接列表 [name](url): 备注)。可选 "Optional" 章节放次要链接。
 *
 * 内容结构按实战验证的"买家四问"框架:
 * 我们是谁 / 有什么 / 怎么用与价格 / 不做什么(边界)+ 主要页面链接。
 * 全部事实仅从页面抓取信号生成,模型不得发明参数与承诺。
 */

export interface SiteSignals {
  url: string;
  title: string;
  description: string;
  headings: string[];
  links: { href: string; text: string }[];
  contentSample: string;
}

export interface LlmsOptions {
  brandName?: string;
  language?: "zh" | "en" | "auto";
  count?: number;
}

/** 从 HTML 提取站点信号(标题/描述/标题层级/站内链接/正文样本)。 */
export function extractSiteSignals(html: string, baseUrl: string): SiteSignals {
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim() ??
    "";
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter((h) => h.length > 1 && h.length <= 80)
    .slice(0, 30);
  const base = new URL(baseUrl);
  const links: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const abs = new URL(m[1].replace(/&amp;/g, "&"), base).toString();
      const u = new URL(abs);
      if (u.hostname !== base.hostname && !u.hostname.endsWith("." + base.hostname)) continue;
      const clean = abs.split("#")[0].split("?")[0];
      if (!clean || clean === base.toString() || seen.has(clean)) continue;
      seen.add(clean);
      const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      links.push({ href: clean, text: text.slice(0, 60) });
    } catch {
      /* 跳过坏链接 */
    }
    if (links.length >= 25) break;
  }
  const contentSample = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
  return { url: baseUrl, title, description, headings, links, contentSample };
}

export function buildLlmsMessages(
  signals: SiteSignals,
  opts: LlmsOptions = {},
): { system: string; user: string } {
  const count = opts.count ?? 6;
  const linksText = signals.links
    .slice(0, 20)
    .map((l) => `- ${l.href} ${l.text ? `(${l.text})` : ""}`.trim())
    .join("\n");

  const system = `你是 llms.txt 生成器(llmstxt.org 规范):为网站产出供 AI 引擎阅读的 llms.txt。

结构(严格按序):
1. H1:站点名称
2. Blockquote(> 开头):3 句话概括"这是谁、做什么、特色"——删掉"专业可靠/品质领先/行业领先"这类空话,只留可验证事实
3. H2 章节,按买家/用户会问的四件事组织:
   - 我们是谁(3 句事实)
   - 有什么(核心能力,尽量做成文字列表或表格)
   - 怎么用与价格(入口/套餐/计费方式;无价格信息则写获取方式)
   - 不做什么(边界与限制——这条建立信任,必须基于内容中明确写到的限制)
4. 主要页面:链接列表 [name](url): 备注
5. 使用说明(1-2 行)

硬规则:
- 全部事实只能来自给定内容,不得发明参数、价格、认证、承诺
- 内容中没有的信息直接不写;不确定的不写
- 语言:与内容一致(中文站输出简体中文)
- llms.txt 正文用于推理场景,写给 AI 与它的用户看,不是给搜索引擎堆词

输出:只输出 llms.txt 的完整 Markdown(以 # 开头),不要代码块包裹,不要解释。`;

  const user = `站点 URL:${signals.url}
<title>:${signals.title}
meta description:${signals.description}
主要标题:${signals.headings.join(" | ")}
站内链接:
${linksText}

正文样本:
"""
${signals.contentSample}
"""

生成 ${count} 个章节以内的 llms.txt(语言:${opts.language ?? "auto"};含"我们是谁/有什么/怎么用与价格/不做什么"四类章节与主要页面链接)。只输出 Markdown。`;

  return { system, user };
}

export interface LlmsValidation {
  ok: boolean;
  reason?: string;
  llms: string;
}

/** 校验 LLM 输出符合 llmstxt.org 最低形态;失败给出原因。 */
export function validateLlms(output: string): LlmsValidation {
  const text = output.trim();
  if (!text.startsWith("# ")) {
    return { ok: false, llms: text, reason: "缺少 H1 标题行(llmstxt.org 要求第一行为 # 项目名)" };
  }
  const links = (text.match(/\]\(https?:\/\//g) ?? []).length;
  if (links < 3) {
    return { ok: false, llms: text, reason: `链接条目过少(${links}),llms.txt 需要列出主要页面` };
  }
  const h2 = (text.match(/^## /gm) ?? []).length;
  if (h2 < 2) {
    return { ok: false, llms: text, reason: `H2 章节过少(${h2}),至少要有 2 个章节` };
  }
  return { ok: true, llms: text };
}
