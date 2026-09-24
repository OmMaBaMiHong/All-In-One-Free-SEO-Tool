import { describe, expect, it } from "vitest";
import { summarizeVisibility, type VisibilityCheckRow } from "./metrics";

const skoob = {
  clientName: "da li",
  domain: "skoob.cc",
  aliases: ["焚诀", "OpenSkoob"],
};

function row(p: Partial<VisibilityCheckRow> = {}): VisibilityCheckRow {
  return {
    query: "AI 写小说",
    provider: "google_ai_mode",
    grounding: "live",
    mentionsDomain: false,
    citationsForDomain: 0,
    citationsCount: 5,
    sentiment: null,
    error: null,
    ...p,
  };
}

describe("summarizeVisibility", () => {
  it("excludes failed checks from every denominator", () => {
    const s = summarizeVisibility(
      [
        row({ mentionsDomain: true }),
        row({ mentionsDomain: false }),
        row({ error: "scrape blocked" }),
        row({ error: "timeout" }),
      ],
      skoob,
    );
    expect(s.live.checks).toBe(2);
    expect(s.live.mentions).toBe(1);
    expect(s.live.mentionRate.point).toBe(0.5);
    expect(s.failed).toBe(2);
  });

  it("keeps memory answers out of the headline rate", () => {
    const s = summarizeVisibility(
      [
        row({ mentionsDomain: true }), // live, mentioned
        row({ grounding: "memory", mentionsDomain: true, provider: "deepseek" }),
        row({ grounding: "memory", mentionsDomain: true, provider: "deepseek" }),
      ],
      skoob,
    );
    expect(s.live.checks).toBe(1);
    expect(s.live.mentions).toBe(1);
    expect(s.memory).toEqual({ checks: 2, mentions: 2 });
  });

  it("computes citation share against all cited URLs, not answer count", () => {
    const s = summarizeVisibility(
      [
        row({ mentionsDomain: true, citationsForDomain: 1, citationsCount: 10 }),
        row({ mentionsDomain: false, citationsForDomain: 0, citationsCount: 2 }),
      ],
      skoob,
    );
    // 1 of 12 cited URLs, not 1 of 2 answers.
    expect(s.live.citationShare).toBeCloseTo(1 / 12);
  });

  it("returns null citation share when nothing was ever cited", () => {
    const s = summarizeVisibility([row({ citationsCount: 0 })], skoob);
    expect(s.live.citationShare).toBeNull();
  });

  it("tallies sentiment only on live mentions", () => {
    const s = summarizeVisibility(
      [
        row({ mentionsDomain: true, sentiment: "positive" }),
        row({ mentionsDomain: true, sentiment: "negative" }),
        row({ mentionsDomain: false, sentiment: "positive" }), // not mentioned
        row({ grounding: "memory", mentionsDomain: true, sentiment: "positive" }),
      ],
      skoob,
    );
    expect(s.live.sentiment).toEqual({
      positive: 1,
      neutral: 0,
      negative: 1,
      mixed: 0,
    });
  });

  it("splits branded vs non-branded slices", () => {
    const s = summarizeVisibility(
      [
        row({ query: "焚诀 Skoob", mentionsDomain: false }),
        row({ query: "焚诀 Skoob", mentionsDomain: true, provider: "copilot" }),
        row({ query: "AI 写小说", mentionsDomain: false }),
      ],
      skoob,
    );
    expect(s.branded.checks).toBe(2);
    expect(s.branded.mentions).toBe(1);
    expect(s.nonBranded.checks).toBe(1);
    expect(s.nonBranded.mentions).toBe(0);
  });

  it("slices per provider", () => {
    const s = summarizeVisibility(
      [
        row({ provider: "google_ai_mode", mentionsDomain: true }),
        row({ provider: "copilot", mentionsDomain: false }),
        row({ provider: "copilot", mentionsDomain: false }),
      ],
      skoob,
    );
    const copilot = s.perProvider.find((p) => p.provider === "copilot");
    const aimode = s.perProvider.find((p) => p.provider === "google_ai_mode");
    expect(copilot?.slice.checks).toBe(2);
    expect(aimode?.slice.mentionRate.point).toBe(1);
  });

  it("is deterministic across runs", () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row({ mentionsDomain: i % 3 === 0, query: i % 2 ? "焚诀 Skoob" : "AI 写小说" }),
    );
    expect(summarizeVisibility(rows, skoob, "c1")).toEqual(
      summarizeVisibility(rows, skoob, "c1"),
    );
  });
});
