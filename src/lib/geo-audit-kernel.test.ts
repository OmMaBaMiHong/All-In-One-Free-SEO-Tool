import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditGeo, type GeoAuditInput } from "./geo-audit-kernel";

const SKOOB_SITE = readFileSync(
  join(__dirname, "__fixtures__", "skoob-site.html"),
  "utf8",
);

const ROBOTS_FRIENDLY = `
User-agent: *
Disallow: /api/

User-agent: GPTBot
Allow: /

User-agent: Baiduspider
Allow: /
`;

const LLMS_GOOD = `# 焚诀 Skoob

> 小说 Agent 与知识库。

## Pages

- [https://skoob.cc/site](https://skoob.cc/site): 产品官网
`;

function base(p: Partial<GeoAuditInput> = {}): GeoAuditInput {
  return {
    html: SKOOB_SITE,
    market: "global",
    robotsTxt: ROBOTS_FRIENDLY,
    llmsTxt: LLMS_GOOD,
    brandName: "焚诀",
    ...p,
  };
}

describe("auditGeo", () => {
  it("scores the real prerendered skoob page in the reasonable band", () => {
    const r = auditGeo(base());
    expect(r.total).toBeGreaterThan(40);
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.veto).toEqual([]);
    // Schema coverage: our JSON-LD declares Organization + WebSite.
    const c2 = r.items.find((i) => i.id === "C2")!;
    expect(c2.note).toContain("organization");
  });

  it("is deterministic for identical inputs", () => {
    expect(auditGeo(base())).toEqual(auditGeo(base()));
  });

  it("unknown robots/llms shrink the denominator instead of failing", () => {
    const withAll = auditGeo(base());
    const without = auditGeo(base({ robotsTxt: null, llmsTxt: null }));
    expect(without.maxTotal).toBeLessThan(withAll.maxTotal);
    const unknownIds = without.items.filter((i) => i.status === "unknown").map((i) => i.id);
    expect(unknownIds).toContain("A1");
    expect(unknownIds).toContain("B1");
    // Totals stay comparable because both are percentage-normalised.
    expect(without.total).toBeGreaterThan(0);
  });

  it("cn market forgives Baiduspider-friendly robots that block AI bots", () => {
    const robots = "User-agent: Baiduspider\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n";
    const cn = auditGeo(base({ market: "cn", robotsTxt: robots }));
    const gl = auditGeo(base({ market: "global", robotsTxt: robots }));
    const cnA1 = cn.items.find((i) => i.id === "A1")!;
    const glA1 = gl.items.find((i) => i.id === "A1")!;
    expect(cnA1.status).toBe("pass");
    expect(glA1.status).not.toBe("pass");
    expect(glA1.note).toContain("GPTBot");
  });

  it("caps CSR shells at the veto line", () => {
    const shell = `<html><head><title>x</title></head><body><div id="root"></div>${"<script>var a=1;</script>".repeat(4)}</body></html>`;
    const r = auditGeo(base({ html: shell }));
    expect(r.veto.length).toBeGreaterThan(0);
    expect(r.veto[0]).toContain("CSR 空壳");
    expect(r.total).toBeLessThanOrEqual(60);
  });

  it("vetoes a FAQPage schema without Question nodes", () => {
    const html = SKOOB_SITE.replace(
      "</head>",
      `<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script></head>`,
    );
    const r = auditGeo(base({ html }));
    expect(r.veto.some((v) => v.includes("FAQPage"))).toBe(true);
    expect(r.total).toBeLessThanOrEqual(60);
  });

  it("flags noindex with a veto", () => {
    const html = SKOOB_SITE.replace(
      "</head>",
      `<meta name="robots" content="noindex, follow"></head>`,
    );
    const r = auditGeo(base({ html }));
    const a2 = r.items.find((i) => i.id === "A2")!;
    expect(a2.status).toBe("fail");
    expect(r.veto.some((v) => v.includes("noindex"))).toBe(true);
  });

  it("rewards a well-formed page over a bare one", () => {
    const good = `
      <html><head><title>AI 写小说指南 - 焚诀</title>
      <meta name="description" content="焚诀 Skoob 是小说创作 Agent,帮你从灵感到成书。">
      <script type="application/ld+json">{"@type":"Article","author":{"@type":"Person","name":"w"},"dateModified":"2026-09-01","headline":"AI 写小说指南"}</script>
      </head><body>
      <h1>AI 写小说指南</h1>
      <p>AI 写小说是把灵感变成结构化稿件的过程。焚诀 Skoob 提供 6 步创作流水线,2026 年已服务超过 1000 名作者。参见 <a href="https://zhuanlan.zhihu.com/x">知乎专栏</a>。</p>
      <h2>什么是 AI 写小说?</h2>
      <p>AI 写小说是用智能体拆解意图、生成世界观、再逐卷推进正文的工作方式。它有 3 个阶段。</p>
      <h2>怎么开始?</h2>
      <ul><li>意图卡</li><li>世界观</li><li>大纲</li></ul>
      <p>创作流程是基于设定档案驱动的。每个角色都有档案。系统会检查一致性。大纲按卷循环推进。正文生成后进入审核。</p>
      <p>写作风格可以配置。模板库支持多种题材。拆书功能可以分析已有作品。知识库沉淀设定与事实。智能体之间会互相协作。产出包括大纲、卷、章节与档案。</p>
      </body></html>`;
    const bad = `<html><head><title>t</title></head><body><p>hello world</p></body></html>`;
    const g = auditGeo(base({ html: good, llmsTxt: null, robotsTxt: null }));
    const b = auditGeo(base({ html: bad, llmsTxt: null, robotsTxt: null }));
    expect(g.total).toBeGreaterThan(b.total + 15);
  });
});
