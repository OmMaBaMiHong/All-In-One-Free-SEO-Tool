import { describe, expect, it } from "vitest";
import {
  brandTerms,
  isBrandedQuery,
  partitionByBrand,
} from "./brand-tags";

const skoob = {
  clientName: "da li",
  domain: "skoob.cc",
  aliases: ["焚诀", "焚诀 Skoob", "天衍", "天工", "OpenSkoob"],
};

describe("brandTerms", () => {
  it("derives terms from name, domain and aliases", () => {
    const terms = brandTerms(skoob);
    expect(terms).toContain("skoob.cc");
    expect(terms).toContain("skoob");
    expect(terms).toContain("焚诀");
    expect(terms).toContain("openskoob");
  });

  it("drops short noise tokens from the client name (the da li trap)", () => {
    const terms = brandTerms({ clientName: "da li", domain: "skoob.cc" });
    expect(terms).not.toContain("da");
  });

  it("strips scheme and www from the domain", () => {
    const terms = brandTerms({ clientName: "x", domain: "https://www.acme.com/a" });
    expect(terms).toContain("acme.com");
    expect(terms).toContain("acme");
  });
});

describe("isBrandedQuery", () => {
  it("brands alias, domain and latin-name queries", () => {
    expect(isBrandedQuery("焚诀 Skoob", skoob)).toBe(true);
    expect(isBrandedQuery("OpenSkoob 是什么", skoob)).toBe(true);
    expect(isBrandedQuery("skoob.cc 打不开", skoob)).toBe(true);
    expect(isBrandedQuery("天衍 引擎", skoob)).toBe(true);
  });

  it("does not brand generic product queries", () => {
    expect(isBrandedQuery("AI 写小说", skoob)).toBe(false);
    expect(isBrandedQuery("best novel writing ai agent", skoob)).toBe(false);
    expect(isBrandedQuery("小说世界观构建工具", skoob)).toBe(false);
  });

  it("matches latin brands glued to suffixes (no word boundary in zh prose)", () => {
    expect(isBrandedQuery("用skoob的体验", skoob)).toBe(true);
  });
});

describe("partitionByBrand", () => {
  it("splits queries into two disjoint sets", () => {
    const items = [
      { query: "焚诀 Skoob" },
      { query: "AI 写小说" },
      { query: "OpenSkoob" },
      { query: "book outline generator" },
    ];
    const { branded, nonBranded } = partitionByBrand(items, skoob);
    expect([...branded].sort()).toEqual(["OpenSkoob", "焚诀 Skoob"]);
    expect([...nonBranded].sort()).toEqual([
      "AI 写小说",
      "book outline generator",
    ]);
  });
});
