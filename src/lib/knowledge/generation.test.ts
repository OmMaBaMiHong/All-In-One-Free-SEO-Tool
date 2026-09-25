import { describe, expect, it } from "vitest";
import { buildGenerationMessages, pickUnusedTitles } from "./generation";

describe("pickUnusedTitles", () => {
  const titles = [
    { id: 1, title: "已用", used: 1 },
    { id: 2, title: "可用 A", used: 0 },
    { id: 3, title: "可用 B", used: 0 },
  ];

  it("returns only unused titles in order", () => {
    expect(pickUnusedTitles(titles, 2).map((t) => t.id)).toEqual([2, 3]);
  });

  it("honours the requested count", () => {
    expect(pickUnusedTitles(titles, 1).map((t) => t.id)).toEqual([2]);
  });

  it("returns empty when everything is used", () => {
    expect(pickUnusedTitles([{ id: 1, title: "x", used: 1 }], 2)).toEqual([]);
  });
});

describe("buildGenerationMessages", () => {
  const { system, user } = buildGenerationMessages({
    title: "小说Agent怎么选?",
    knowledge: ["焚诀 Skoob 提供六步创作流水线,2026 年服务 1000 名作者。"],
  });

  it("encodes the rules the scoring kernel grades on", () => {
    expect(system).toContain("答案前置");
    expect(system).toContain("事实密度");
    expect(system).toContain("反 AI 味");
    expect(system).toContain("FAQ");
  });

  it("embeds the title and evidence", () => {
    expect(user).toContain("小说Agent怎么选?");
    expect(user).toContain("[证据 1] 焚诀 Skoob 提供六步创作流水线");
  });

  it("provides the no-evidence fallback wording when recall is empty", () => {
    const { user: empty } = buildGenerationMessages({ title: "t", knowledge: [] });
    expect(empty).toContain("不得出现具体产品事实");
  });
});
