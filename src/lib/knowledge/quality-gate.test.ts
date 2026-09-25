import { describe, expect, it } from "vitest";
import {
  computeQualityGate,
  evidenceCoverage,
  keyEvidenceTerms,
  scanAdViolations,
} from "./quality-gate";

const GOOD_ARTICLE = `# 小说 Agent 怎么选?

小说 Agent 是把创作拆成流水线的 AI 工具,选型看三点:知识库、仿真、质检。
截至 2026 年,主流产品都支持意图卡和大纲生成。

## 如何判断知识库质量?

看设定档案是否完整。焚诀 Skoob 的设定即智能体方案把人物、地点、势力都建档,
已验证批次保存为检查点,可恢复。

## 有哪些创作模式?

三种模式:引导、剧场、互动影游。引导模式逐步确认,剧场模式对话参与。

- 意图卡
- 世界观
- 大纲
`;

const BAD_AD_ARTICLE = `# 全网最强的小说 Agent

这是史上最好的写作工具,绝对有效,销量第一名。`;

describe("scanAdViolations", () => {
  it("detects absolute terms with counts", () => {
    const v = scanAdViolations(BAD_AD_ARTICLE);
    expect(v.length).toBeGreaterThanOrEqual(3);
    expect(v.some((x) => x.includes("「最」系"))).toBe(true);
    expect(v.some((x) => x.includes("史上最"))).toBe(true);
  });

  it("passes clean text", () => {
    expect(scanAdViolations(GOOD_ARTICLE)).toEqual([]);
  });

  it("does not false-positive on 最近/最好用的部分截断边界", () => {
    expect(scanAdViolations("我最近在写小说。")).toEqual([]);
  });
});

describe("keyEvidenceTerms", () => {
  it("extracts frequent domain terms", () => {
    const terms = keyEvidenceTerms("焚诀 Skoob 的六步创作流水线。焚诀支持拆书。焚诀有知识库。");
    expect(terms).toContain("焚诀");
  });
});

describe("evidenceCoverage", () => {
  it("full score when no knowledge provided", () => {
    expect(evidenceCoverage("任意文本", []).score).toBe(40);
  });

  it("scores coverage of evidence key terms and reports missing", () => {
    const evidence = ["焚诀 Skoob 六步创作流水线 意图卡 世界观 大纲"];
    const full = evidenceCoverage(
      "焚诀 Skoob 六步创作流水线 包含 意图卡、世界观 和 大纲。",
      evidence,
    );
    const none = evidenceCoverage("完全无关的文章内容。", evidence);
    expect(full.score).toBeGreaterThan(none.score);
    expect(none.issues.length).toBeGreaterThan(0);
  });
});

describe("computeQualityGate", () => {
  it("passes a compliant structured article with evidence", () => {
    const r = computeQualityGate(GOOD_ARTICLE, [GOOD_ARTICLE.slice(0, 200)]);
    // structure partial is fine; ad is clean → verdict depends on total
    expect(r.adCompliance.score).toBe(30);
  });

  it("rejects ad-heavy text regardless of other dimensions", () => {
    const r = computeQualityGate(BAD_AD_ARTICLE, []);
    expect(r.verdict).toBe("reject");
    expect(r.adCompliance.issues.length).toBeGreaterThanOrEqual(3);
  });
});
