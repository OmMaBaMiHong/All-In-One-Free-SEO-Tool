import { describe, expect, it, vi } from "vitest";
import {
  articleSlugPath,
  baiduPush,
  blogUrl,
  renderArticleHtml,
  GOOGLE_VERIFICATION,
  BAIDU_VERIFICATION,
} from "./publish";

const ARTICLE = {
  id: 42,
  title: "小说 Agent 怎么选?",
  contentMd:
    "# 小说 Agent 怎么选?\n\n小说 Agent 是把创作拆成流水线的 AI 工具,选型看知识库、仿真与质检三件事。\n\n## 如何判断知识库质量?\n\n看设定档案是否完整。\n\n- 意图卡\n- 世界观",
};

describe("slug/url helpers", () => {
  it("builds deterministic blog urls", () => {
    expect(blogUrl(42)).toBe("https://skoob.cc/blog/42.html");
    expect(articleSlugPath(42)).toBe("blog/42.html");
  });
});

describe("renderArticleHtml", () => {
  const r = renderArticleHtml(ARTICLE);

  it("renders the markdown body as HTML", () => {
    expect(r.html).toContain("<h1>小说 Agent 怎么选?</h1>");
    expect(r.html).toContain("<li>意图卡</li>");
  });

  it("includes the full SEO shell", () => {
    expect(r.html).toContain(`<link rel="canonical" href="${blogUrl(42)}" />`);
    expect(r.html).toContain('name="description"');
    expect(r.html).toContain('"@type":"Article"');
    expect(r.html).toContain(GOOGLE_VERIFICATION);
    expect(r.html).toContain(BAIDU_VERIFICATION);
    expect(r.html).toContain("浙ICP备2026010374号-3");
  });

  it("escapes the title into meta to prevent tag injection", () => {
    const x = renderArticleHtml({ ...ARTICLE, title: '坏标题" /><script>' });
    expect(x.html).not.toContain('坏标题" /><script>');
    expect(x.html).toContain("&quot;");
    expect(x.html).toContain("&lt;script&gt;");
  });
});

describe("baiduPush", () => {
  it("parses a success response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: 2, remain: 8 }), { status: 200 }),
    );
    const out = await baiduPush(["https://skoob.cc/blog/1.html"], "tok", fetchMock as unknown as typeof fetch);
    expect(out.ok).toBe(true);
    expect(out.detail).toContain("success=2");
  });

  it("classifies over-quota as a soft failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 400, message: "over quota" }), { status: 400 }),
    );
    const out = await baiduPush(["https://skoob.cc/blog/1.html"], "tok", fetchMock as unknown as typeof fetch);
    expect(out.ok).toBe(false);
    expect(out.detail).toContain("over quota");
  });

  it("survives network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    const out = await baiduPush(["u"], "tok", fetchMock as unknown as typeof fetch);
    expect(out.ok).toBe(false);
  });
});
