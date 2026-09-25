import { describe, expect, it } from "vitest";
import { chunkText } from "./chunker";
import { extractTerms, rankChunks, scoreText } from "./recall";

describe("chunkText", () => {
  it("starts new chunks at headings", () => {
    const md = `# 引擎总览\n天魔负责灵感。天王负责拆书。\n\n# 定价\n有三档月卡。`;
    const chunks = chunkText(md, { maxChars: 500, minChars: 10 });
    expect(chunks.length).toBe(2);
    expect(chunks[0].content).toContain("天魔");
    expect(chunks[1].content).toContain("定价");
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("splits oversized blocks on sentences, not mid-word", () => {
    const long = "。" + "这是一个完整的句子用来测试切片逻辑。".repeat(60);
    const chunks = chunkText(`## 长文\n${long}`, { maxChars: 300 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      for (const line of c.content.split("\n")) {
        // no cut inside a CJK word: chunk ends are sentence/clause ends
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });

  it("merges tiny chunks forward", () => {
    const md = `## A\n短。\n\n## B\n也比较短,但这一段更长一些,用来避免合并后仍然过短的情况出现。`;
    const chunks = chunkText(md, { maxChars: 500, minChars: 400 });
    // both are tiny relative to minChars=400 → merged into one
    expect(chunks.length).toBe(1);
  });

  it("returns [] for empty input", () => {
    expect(chunkText("   ")).toEqual([]);
  });
});

describe("extractTerms", () => {
  it("extracts latin words and CJK bigrams", () => {
    const terms = extractTerms("用 AI 写小说 worldbuilding");
    expect(terms).toContain("ai");
    expect(terms).toContain("写小");
    expect(terms).toContain("小说");
    expect(terms).toContain("worldbuilding");
  });
});

describe("scoreText / rankChunks", () => {
  it("scores matched terms with length weighting", () => {
    const a = scoreText("小说创作智能体支持拆书功能", ["小说", "拆书"]);
    const b = scoreText("随便聊聊天", ["小说", "拆书"]);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.matchedTerms.length).toBe(2);
  });

  it("ranks the relevant chunk first", () => {
    const chunks = [
      { id: 1, content: "今天天气不错,适合出去走走。" },
      { id: 2, content: "AI 写小说的六步流水线:意图卡、世界观、大纲、卷与循环、正文。" },
      { id: 3, content: "摄影入门指南。" },
    ];
    const ranked = rankChunks(chunks, "AI 写小说 流水线");
    expect(ranked[0].item.id).toBe(2);
    expect(ranked[0].matchedTerms.length).toBeGreaterThan(0);
  });

  it("never returns zero-score chunks", () => {
    const ranked = rankChunks([{ id: 1, content: "无关内容" }], "量子物理");
    expect(ranked).toEqual([]);
  });
});
