import { describe, expect, it } from "vitest";
import {
  buildLlmsMessages,
  extractSiteSignals,
  validateLlms,
} from "./llms-tool";

const HTML = `<html><head><title>焚诀 Skoob · 小说 Agent</title>
<meta name="description" content="AI 多智能体小说创作工具" /></head>
<body>
<h1>让每一个脑洞，长成一本小说</h1>
<h2>四大引擎</h2><p>天魔、天王、天衍、天工。</p>
<a href="/site">产品介绍</a>
<a href="/pricing">定价</a>
<a href="https://github.com/OmMaBaMiHong/open-skoob">开源</a>
<a href="javascript:void(0)">坏链接</a>
</body></html>`;

const BASE = "https://skoob.cc";

describe("extractSiteSignals", () => {
  const s = extractSiteSignals(HTML, BASE);

  it("提取标题与描述", () => {
    expect(s.title).toContain("焚诀 Skoob");
    expect(s.description).toContain("AI 多智能体");
  });

  it("只保留站内链接并转绝对地址", () => {
    expect(s.links.some((l) => l.href === `${BASE}/site`)).toBe(true);
    expect(s.links.every((l) => !l.href.startsWith("javascript"))).toBe(true);
    // 外链(不同域名)被排除
    expect(s.links.every((l) => !l.href.includes("github.com"))).toBe(true);
  });

  it("提取标题层级", () => {
    expect(s.headings).toContain("让每一个脑洞，长成一本小说");
    expect(s.headings).toContain("四大引擎");
  });
});

describe("buildLlmsMessages", () => {
  it("提示词包含规范结构要求与站点信号", () => {
    const s = extractSiteSignals(HTML, BASE);
    const { system, user } = buildLlmsMessages(s, { count: 6 });
    expect(system).toContain("llmstxt.org");
    expect(system).toContain("我们是谁");
    expect(system).toContain("不做什么");
    expect(user).toContain(BASE);
    expect(user).toContain("四大引擎");
  });
});

describe("validateLlms", () => {
  it("接受规范输出", () => {
    const llms = [
      "# 焚诀 Skoob",
      "",
      "> AI 小说创作工具。",
      "",
      "## 我们是谁",
      "- [官网](https://skoob.cc): 官网",
      "- [文档](https://skoob.cc/site/docs): 文档",
      "- [定价](https://skoob.cc/pricing): 定价",
      "",
      "## 有什么",
      "- 六步流水线",
      "",
      "## 怎么用与价格",
      "- 月卡",
      "",
      "## 不做什么",
      "- 不代写",
    ].join("\n");
    const out = validateLlms(llms);
    expect(out.ok).toBe(true);
  });

  it("拒绝缺 H1", () => {
    expect(validateLlms("没有标题的文本").ok).toBe(false);
  });

  it("拒绝链接过少", () => {
    const out = validateLlms("# 焚诀\n\n> x\n\n## 主要页面\n- [一个](https://a.com): x\n\n## 不做什么\n- x\n");
    expect(out.ok).toBe(false);
  });
});
