import { describe, expect, it, vi } from "vitest";
import { buildGeuMessages, geuCheck, parseGeuOutput } from "./geu";

const ORIGINAL = `焚诀 Skoob 是小说创作 Agent,提供 6 步创作流水线,2026 年已服务 1000 名作者。
支持拆书、世界仿真与三种创作模式,定价从启笔到著作三档月卡。`;

const GOOD_REWRITE = `焚诀 Skoob 是什么?它是面向小说作者的 AI 创作 Agent,提供 6 步创作流水线。
截至 2026 年,它已服务 1000 名作者。核心能力包括拆书、世界仿真与三种创作模式。
定价如何?从启笔到著作共三档月卡。`;

const SLOP_REWRITE = `在当今时代,AI 写作已经成为潮流!总之,焚诀 Skoob 是最强大的工具,支持 8 步创作流水线,
已服务 5000 名作者,完全免费,无所不能。综上所述,选择它就对了!`;

const FACT_BREAK_REWRITE = `焚诀 Skoob 是视频剪辑工具,提供 3 步创作流水线,2020 年已上线。`;

function judgeReturning(json: string) {
  return vi.fn().mockResolvedValue(json);
}

describe("parseGeuOutput", () => {
  it("computes total from dimensions and re-derives the verdict", () => {
    const raw = JSON.stringify({
      factConsistency: { score: 38, issues: [] },
      completeness: { score: 26, issues: [] },
      readability: { score: 25, issues: [] },
      reason: "faithful and clean",
    });
    const out = parseGeuOutput(raw)!;
    expect(out.total).toBe(89);
    expect(out.verdict).toBe("pass");
  });

  it("fails a high-total rewrite with broken facts", () => {
    const raw = JSON.stringify({
      factConsistency: { score: 20, issues: ["8 步 != 6 步"] },
      completeness: { score: 30, issues: [] },
      readability: { score: 30, issues: [] },
    });
    const out = parseGeuOutput(raw)!;
    expect(out.total).toBe(80);
    expect(out.verdict).toBe("fail"); // fact floor 35 not met
  });

  it("clamps out-of-range scores", () => {
    const raw = JSON.stringify({
      factConsistency: { score: 99, issues: [] },
      completeness: { score: -5, issues: [] },
      readability: { score: 30, issues: [] },
    });
    const out = parseGeuOutput(raw)!;
    expect(out.factConsistency.score).toBe(40);
    expect(out.completeness.score).toBe(0);
  });

  it("returns null for unparseable output", () => {
    expect(parseGeuOutput("好的")).toBeNull();
  });
});

describe("geuCheck", () => {
  it("passes a faithful rewrite", async () => {
    const judge = judgeReturning(
      JSON.stringify({
        factConsistency: { score: 39, issues: [] },
        completeness: { score: 27, issues: [] },
        readability: { score: 26, issues: [] },
      }),
    );
    const out = await geuCheck(ORIGINAL, GOOD_REWRITE, { judge });
    expect(out.verdict).toBe("pass");
    expect(out.source).toBe("judge");
  });

  it("fails a fact-breaking rewrite even if readable", async () => {
    const judge = judgeReturning(
      JSON.stringify({
        factConsistency: { score: 5, issues: ["视频剪辑 != 小说 Agent", "2020 != 2026"] },
        completeness: { score: 10, issues: [] },
        readability: { score: 30, issues: [] },
      }),
    );
    const out = await geuCheck(ORIGINAL, FACT_BREAK_REWRITE, { judge });
    expect(out.verdict).toBe("fail");
    expect(out.factConsistency.issues.length).toBe(2);
  });

  it("returns source none with fail verdict when judge unavailable", async () => {
    const judge = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await geuCheck(ORIGINAL, GOOD_REWRITE, { judge });
    expect(out.source).toBe("none");
    expect(out.verdict).toBe("fail");
    expect(out.reason).toContain("NOT verified");
  });
});

describe("buildGeuMessages", () => {
  it("embeds both texts and the fact-preservation contract", () => {
    const { system, user } = buildGeuMessages(ORIGINAL, GOOD_REWRITE);
    expect(system).toContain("factConsistency (max 40)");
    expect(system).toContain("AI-slop patterns");
    expect(user).toContain(ORIGINAL);
    expect(user).toContain(GOOD_REWRITE);
  });
});
