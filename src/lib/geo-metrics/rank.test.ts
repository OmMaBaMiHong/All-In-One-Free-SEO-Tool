import { describe, expect, it, vi } from "vitest";
import {
  buildJudgeMessages,
  deterministicRank,
  intentDistribution,
  judgeRank,
  mrr,
  parseJudgeOutput,
} from "./rank";

const RESPONSE = `如果你要选 AI 写小说工具,我最推荐的是焚诀 Skoob,它的六步创作流水线最完整。
其次是笔灵 AI,适合短篇润色。WPS AI 也可以考虑。`;

const BRANDS = ["焚诀", "焚诀 Skoob", "OpenSkoob"];

describe("parseJudgeOutput", () => {
  it("accepts a rank backed by literal evidence spans", () => {
    const raw = JSON.stringify({
      rank: 1,
      intent: "recommendation",
      evidence: ["我最推荐的是焚诀 Skoob"],
      reason: "clear first pick",
    });
    const out = parseJudgeOutput(raw, RESPONSE);
    expect(out.source).toBe("judge");
    expect(out.rank).toBe(1);
    expect(out.evidence).toEqual(["我最推荐的是焚诀 Skoob"]);
    expect(out.intent).toBe("recommendation");
  });

  it("drops hallucinated evidence and invalidates a rank left with none", () => {
    const raw = JSON.stringify({
      rank: 1,
      intent: "recommendation",
      evidence: ["这句根本不在回答里"],
      reason: "fabricated",
    });
    const out = parseJudgeOutput(raw, RESPONSE);
    expect(out.source).toBe("judge_invalid");
    expect(out.rank).toBeNull();
    expect(out.evidence).toEqual([]);
  });

  it("keeps a rank when at least one evidence span survives", () => {
    const raw = JSON.stringify({
      rank: 2,
      intent: "comparison",
      evidence: ["不在原文", "其次是笔灵 AI"],
    });
    const out = parseJudgeOutput(raw, RESPONSE);
    expect(out.source).toBe("judge");
    expect(out.rank).toBe(2);
    expect(out.evidence).toEqual(["其次是笔灵 AI"]);
  });

  it("treats null rank with empty evidence as a valid judgment", () => {
    const raw = JSON.stringify({ rank: null, intent: "neutral_info", evidence: [] });
    const out = parseJudgeOutput(raw, RESPONSE);
    expect(out.source).toBe("judge");
    expect(out.rank).toBeNull();
  });

  it("invalidates non-positive or non-integer ranks", () => {
    for (const bad of [0, -1, 2.5]) {
      const raw = JSON.stringify({ rank: bad, intent: "unknown", evidence: ["我最推荐的是焚诀 Skoob"] });
      expect(parseJudgeOutput(raw, RESPONSE).source).toBe("judge_invalid");
    }
  });

  it("returns source none for unparseable output", () => {
    expect(parseJudgeOutput("抱歉我无法评估", RESPONSE).source).toBe("none");
  });
});

describe("deterministicRank", () => {
  it("detects chinese ordinals near the brand", () => {
    expect(deterministicRank("排名第一的是焚诀 Skoob。", BRANDS)).toBe(1);
    expect(deterministicRank("第二名是焚诀。", BRANDS)).toBe(2);
    expect(deterministicRank("首推焚诀 Skoob。", BRANDS)).toBe(1);
  });

  it("detects numbered list markers", () => {
    expect(deterministicRank("1. 焚诀 Skoob 是首选。", BRANDS)).toBe(1);
    // A list marker plus a bare mention still yields the marker's rank —
    // the sidecar is deliberately crude; the judge is the authority.
    expect(deterministicRank("2、笔灵;但焚诀也强。", BRANDS)).toBe(2);
    expect(deterministicRank("③ 焚诀 Skoob 支持拆书。", BRANDS)).toBe(3);
    expect(deterministicRank("焚诀 Skoob 也被顺带提到。", BRANDS)).toBeNull();
  });

  it("returns null without brand or ordinal", () => {
    expect(deterministicRank("焚诀 Skoob 提供流水线。", BRANDS)).toBeNull();
    expect(deterministicRank("排名第一的是别的工具。", BRANDS)).toBeNull();
  });
});

describe("judgeRank", () => {
  it("validates the judge and attaches the deterministic sidecar", async () => {
    const judge = vi.fn().mockResolvedValue(
      JSON.stringify({ rank: 1, intent: "recommendation", evidence: ["我最推荐的是焚诀 Skoob"] }),
    );
    const out = await judgeRank("AI 写小说哪个好?", RESPONSE, BRANDS, { judge });
    expect(out.source).toBe("judge");
    expect(out.rank).toBe(1);
    expect(out.deterministicRank).toBe(1);
    expect(out.deterministicAgrees).toBe(true);
  });

  it("flags disagreement between judge and deterministic scan", async () => {
    const judge = vi.fn().mockResolvedValue(
      JSON.stringify({ rank: 2, intent: "recommendation", evidence: ["其次是笔灵 AI"] }),
    );
    const out = await judgeRank("对比一下工具", RESPONSE, BRANDS, { judge });
    expect(out.rank).toBe(2);
    expect(out.deterministicAgrees).toBe(false);
  });

  it("survives a judge failure with source none", async () => {
    const judge = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await judgeRank("q", RESPONSE, BRANDS, { judge });
    expect(out.source).toBe("none");
    expect(out.deterministicAgrees).toBeNull();
  });
});

describe("aggregation", () => {
  it("computes MRR with nulls contributing zero", () => {
    expect(mrr([{ rank: 1 }, { rank: 3 }, { rank: null }])).toBeCloseTo((1 + 1 / 3) / 3);
    expect(mrr([])).toBeNull();
  });

  it("tallies intent distribution", () => {
    const d = intentDistribution([
      { intent: "recommendation" },
      { intent: "recommendation" },
      { intent: "comparison" },
    ]);
    expect(d).toEqual({ recommendation: 2, comparison: 1, neutral_info: 0, unknown: 0 });
  });
});

describe("buildJudgeMessages", () => {
  it("embeds brand terms and the response verbatim", () => {
    const { user } = buildJudgeMessages("q", RESPONSE, BRANDS);
    expect(user).toContain("焚诀 | 焚诀 Skoob | OpenSkoob");
    expect(user).toContain(RESPONSE);
  });
});
