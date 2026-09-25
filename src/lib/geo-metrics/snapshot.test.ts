import { describe, expect, it } from "vitest";
import { compareSnapshots } from "./snapshot";

const row = (mentionRate: number | null, mrr: number | null) => ({
  mentionRate,
  mrr,
});

describe("compareSnapshots", () => {
  it("computes deltas and an up direction", () => {
    const d = compareSnapshots(row(0.2, 0.3), row(0.3, 0.45));
    expect(d.mentionRateDelta).toBeCloseTo(0.1);
    expect(d.mrrDelta).toBeCloseTo(0.15);
    expect(d.direction).toBe("up");
  });

  it("stays flat inside the 5% relative band", () => {
    const d = compareSnapshots(row(0.20, null), row(0.205, null));
    expect(d.direction).toBe("flat");
  });

  it("marks a >5% relative drop as down", () => {
    const d = compareSnapshots(row(0.30, null), row(0.20, null));
    expect(d.direction).toBe("down");
  });

  it("returns null deltas when either side lacks the metric", () => {
    const d = compareSnapshots(row(null, null), row(0.3, 0.4));
    expect(d.mentionRateDelta).toBeNull();
    expect(d.mrrDelta).toBeNull();
    expect(d.direction).toBeNull();
  });
});
