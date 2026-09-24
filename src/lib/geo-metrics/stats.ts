/**
 * Seeded bootstrap confidence intervals for share metrics (mention rate,
 * citation rate). Ported from geobench's stats kernel — the design goals
 * carry over unchanged:
 *
 * 1. Deterministic: the same rows produce the same CI on every run, so a
 *    rerun never "moves the number" and regressions are testable.
 * 2. Seeded per (scope, metric): resampling noise must not correlate
 *    between metrics just because they were computed in the same process.
 * 3. Small-sample honesty: n=1 returns the point estimate with a null CI
 *    (nothing to resample), n=0 returns nulls — never a fake 0±0.
 */

/** FNV-1a 32-bit — stable across sessions, unlike string hashing in V8. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, good-enough PRNG for resampling. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShareCI {
  /** Point estimate in [0,1]. Null when there are no samples. */
  point: number | null;
  /** Lower bound of the 95% percentile CI. Null when point is null. */
  low: number | null;
  /** Upper bound of the 95% percentile CI. */
  high: number | null;
  /** Sample size the estimate is based on. */
  n: number;
}

const RESAMPLES = 1000;

/**
 * Percentile bootstrap CI for the mean of 0/1 indicators. `scopeKey` seeds
 * the PRNG so the same logical metric is stable regardless of call order.
 */
export function shareCI(
  indicators: boolean[],
  scopeKey: string,
): ShareCI {
  const n = indicators.length;
  if (n === 0) return { point: null, low: null, high: null, n: 0 };
  const hits = indicators.filter(Boolean).length;
  const point = hits / n;
  if (n === 1) return { point, low: null, high: null, n };

  const rand = mulberry32(fnv1a(scopeKey));
  const means: number[] = [];
  for (let r = 0; r < RESAMPLES; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      // Sample with replacement: index = floor(rand() * n) is the standard
      // in-place bootstrap draw and avoids materialising an array per round.
      sum += indicators[(rand() * n) | 0] ? 1 : 0;
    }
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  // 2.5 / 97.5 percentile indices, clamped into the array.
  const lo = means[Math.floor(0.025 * (RESAMPLES - 1))];
  const hi = means[Math.ceil(0.975 * (RESAMPLES - 1))];
  return { point, low: lo, high: hi, n };
}

/** "37% ±5" style rendering for compact UI chips. */
export function formatShare(ci: ShareCI): string {
  if (ci.point === null) return "—";
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (ci.low === null || ci.high === null) return pct(ci.point);
  const half = Math.max(ci.point - ci.low, ci.high - ci.point);
  return `${pct(ci.point)} ±${Math.round(half * 100)}pp`;
}
