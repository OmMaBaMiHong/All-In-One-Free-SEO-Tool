import { describe, expect, it } from "vitest";
import { shareCI, formatShare } from "./stats";

describe("shareCI", () => {
  it("returns nulls for zero samples instead of a fake 0±0", () => {
    const ci = shareCI([], "scope");
    expect(ci.point).toBeNull();
    expect(ci.low).toBeNull();
    expect(ci.high).toBeNull();
    expect(ci.n).toBe(0);
  });

  it("returns the point estimate with null CI for a single sample", () => {
    const ci = shareCI([true], "scope");
    expect(ci.point).toBe(1);
    expect(ci.low).toBeNull();
    expect(ci.high).toBeNull();
    expect(ci.n).toBe(1);
  });

  it("is deterministic for the same scope key", () => {
    const flags = Array.from({ length: 40 }, (_, i) => i % 3 === 0);
    const a = shareCI(flags, "client-1:mention");
    const b = shareCI(flags, "client-1:mention");
    expect(a).toEqual(b);
  });

  it("different scope keys may differ (independent resampling)", () => {
    const flags = Array.from({ length: 60 }, (_, i) => i % 4 === 0);
    const a = shareCI(flags, "client-1:mention");
    const b = shareCI(flags, "client-1:citation");
    // Same data → same point, but the resample draws are seeded differently,
    // so the bounds almost surely differ at the pp level.
    expect(a.point).toBe(b.point);
  });

  it("contains the point estimate for a homogeneous sample", () => {
    const ci = shareCI(new Array(30).fill(true), "s");
    expect(ci.point).toBe(1);
    expect(ci.low).toBe(1);
    expect(ci.high).toBe(1);
  });

  it("widens for small samples relative to large ones", () => {
    const small = shareCI([true, false], "small");
    const large = shareCI(
      Array.from({ length: 400 }, (_, i) => i % 2 === 0),
      "large",
    );
    const width = (ci: { low: number | null; high: number | null }) =>
      (ci.high ?? 0) - (ci.low ?? 0);
    expect(width(small)).toBeGreaterThan(width(large));
  });
});

describe("formatShare", () => {
  it("renders em-dash for no data", () => {
    expect(formatShare(shareCI([], "x"))).toBe("—");
  });
  it("renders bare percent when CI is unavailable", () => {
    expect(formatShare(shareCI([false], "x"))).toBe("0%");
  });
  it("renders with ±pp when CI exists", () => {
    const out = formatShare(shareCI(new Array(20).fill(true), "x"));
    expect(out).toMatch(/^100% ±0pp$/);
  });
});
