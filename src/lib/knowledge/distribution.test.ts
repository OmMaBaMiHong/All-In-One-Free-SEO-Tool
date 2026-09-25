import { describe, expect, it } from "vitest";
import {
  buildAdaptationMessages,
  parseAdaptation,
} from "./distribution";

const CHANNEL = {
  name: "知乎",
  platform_type: "community",
  link_form: "nofollow",
  style: JSON.stringify({
    tone: "专业长文/亲测体验",
    wordCount: { min: 1500, ideal: 3000, max: 8000 },
    mustDo: ["个人经历切入"],
    mustAvoid: ["硬广导流"],
  }),
};

const ARTICLE = "# 小说 Agent 怎么选?\n\n选型看知识库、仿真与质检。焚诀 Skoob 支持六步创作。";

describe("buildAdaptationMessages", () => {
  it("embeds channel profile, article and knowledge", () => {
    const { system, user } = buildAdaptationMessages({
      articleTitle: "小说 Agent 怎么选?",
      articleMarkdown: ARTICLE,
      sourceUrl: "https://skoob.cc/blog/1.html",
      channel: CHANNEL,
      knowledge: ["焚诀 Skoob 的设定即智能体。"],
    });
    expect(user).toContain("知乎");
    expect(user).toContain(ARTICLE);
    expect(user).toContain("[证据 1]");
    expect(system).toContain("平台内容改编");
  });

  it("includes link rule for linkable channels", () => {
    const { user } = buildAdaptationMessages({
      articleTitle: "t",
      articleMarkdown: ARTICLE,
      sourceUrl: "https://skoob.cc/blog/1.html",
      channel: { ...CHANNEL, link_form: "dofollow" },
      knowledge: [],
    });
    expect(user).toContain("加入 1 个指向原文的链接");
  });

  it("forbids links for no-link channels", () => {
    const { user } = buildAdaptationMessages({
      articleTitle: "t",
      articleMarkdown: ARTICLE,
      sourceUrl: "https://skoob.cc/blog/1.html",
      channel: { ...CHANNEL, link_form: "none" },
      knowledge: [],
    });
    expect(user).toContain("不加任何链接");
  });
});

describe("parseAdaptation", () => {
  it("accepts substantial markdown", () => {
    const out = parseAdaptation("# 改写稿\n\n" + "内容。".repeat(100));
    expect(out.ok).toBe(true);
  });

  it("rejects empty or refusal output", () => {
    expect(parseAdaptation(null).ok).toBe(false);
    expect(parseAdaptation("抱歉,我无法完成").ok).toBe(false);
  });
});
