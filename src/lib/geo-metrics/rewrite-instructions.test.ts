import { describe, expect, it } from "vitest";
import { auditGeo } from "../geo-audit-kernel";
import { compileRewriteInstructions } from "./rewrite-instructions";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKOOB_SITE = readFileSync(
  join(__dirname, "..", "__fixtures__", "skoob-site.html"),
  "utf8",
);

function audit(opts: Partial<Parameters<typeof auditGeo>[0]> = {}) {
  return auditGeo({
    html: SKOOB_SITE,
    market: "global",
    robotsTxt: "User-agent: *\nSitemap: https://skoob.cc/sitemap.xml",
    llmsTxt: "# x\n\ncontent",
    brandName: "焚诀",
    ...opts,
  });
}

describe("compileRewriteInstructions", () => {
  const pkg = compileRewriteInstructions(audit(), { engine: "claude" });

  it("compiles only failed/partial items, ordered by gap descending", () => {
    expect(pkg.instructions.length).toBeGreaterThan(0);
    for (let i = 1; i < pkg.instructions.length; i++) {
      expect(pkg.instructions[i - 1].gap).toBeGreaterThanOrEqual(pkg.instructions[i].gap);
    }
    // The real skoob page has no FAQPage — E4 should surface.
    expect(pkg.instructions.some((i) => i.checkId === "E4")).toBe(true);
  });

  it("classifies targets: prose fixes vs infrastructure generators", () => {
    for (const i of pkg.instructions) {
      expect(["content", "infrastructure"]).toContain(i.target);
    }
    // C1 (missing JSON-LD) is an infra fix, not prose work.
    const c1 = compileRewriteInstructions({
      items: [{ id: "C1", name: "JSON-LD", weight: 4, earned: 0, status: "fail", note: "" }],
      market: "global",
    });
    expect(c1.instructions[0].target).toBe("infrastructure");
    // D2 (fact density) is a content rewrite.
    const d2 = compileRewriteInstructions({
      items: [{ id: "D2", name: "主张密度", weight: 6, earned: 0, status: "fail", note: "" }],
      market: "global",
    });
    expect(d2.instructions[0].target).toBe("content");
  });

  it("carries the KDD'24 lift only where the research recorded one", () => {
    const d2 = compileRewriteInstructions({
      items: [{ id: "D2", name: "主张密度", weight: 6, earned: 0, status: "fail", note: "" }],
      market: "global",
    }).instructions[0];
    expect(d2.expectedLift).toContain("+33%");
    const e4 = compileRewriteInstructions({
      items: [{ id: "E4", name: "FAQ 化", weight: 3, earned: 0, status: "fail", note: "" }],
      market: "global",
    }).instructions[0];
    expect(e4.expectedLift).toContain("2.7x");
    const c1 = compileRewriteInstructions({
      items: [{ id: "C1", name: "JSON-LD", weight: 4, earned: 0, status: "fail", note: "" }],
      market: "global",
    }).instructions[0];
    expect(c1.expectedLift).toBeUndefined();
  });

  it("attaches the engine fork for the requested engine", () => {
    expect(pkg.engineFork).toContain("Claude");
    const doubao = compileRewriteInstructions(audit(), { engine: "豆包" });
    expect(doubao.engineFork).toContain("豆包");
    const unknownEngine = compileRewriteInstructions(audit(), { engine: "mystery" });
    expect(unknownEngine.engineFork).toContain("未指定引擎");
  });

  it("renders markdown with instructions, constraints and anti-AI clause", () => {
    expect(pkg.markdown).toContain("# GEO 改写指令包");
    expect(pkg.markdown).toContain("## 全局约束");
    expect(pkg.markdown).toContain("反 AI 味约束");
    expect(pkg.markdown).toContain("绝不编造");
    expect(pkg.markdown).toContain("基础设施(非内容改写)");
  });

  it("routes every audit check id through the map without crashing", () => {
    // All 22 ids from the kernel produce a usable instruction.
    const ids = ["A1","A2","B1","B2","C1","C2","C3","C4","D1","D2","D3","D4","D5","E1","E2","E3","E4","E5","F1","F2","F3","F4"];
    const items = ids.map((id) => ({
      id, name: id, weight: 4, earned: 0,
      status: "fail" as const, note: "",
    }));
    const full = compileRewriteInstructions({ items, market: "cn" });
    expect(full.instructions.length).toBe(ids.length);
    for (const i of full.instructions) {
      expect(i.action.length).toBeGreaterThan(20);
    }
  });
});
