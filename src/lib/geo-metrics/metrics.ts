/**
 * Aggregation kernel for AI-visibility checks — the "how many, how
 * confident" layer between raw per-check rows and the dashboard.
 *
 * Measurement rules (each one prevents a specific way this number lies):
 *
 * - Failed checks (error non-null) leave the denominators entirely. A
 *   blocked scrape says nothing about visibility; counting it as "not
 *   mentioned" manufactures fake certainty in the wrong direction.
 * - The headline mention rate counts only `grounding === "live"` rows —
 *   an answer the model produced without searching reflects training
 *   data, not AI-search visibility. Memory answers get their own line,
 *   never mixed in.
 * - CIs are seeded bootstrap (see stats.ts). With <10 live checks the UI
 *   is expected to render a low-confidence marker: a ±40pp interval is
 *   the math telling you to run more checks, not a bug.
 * - Citation *share* divides the client's cited URLs by ALL cited URLs in
 *   the same answers, because engines cite very different volumes
 *   (Perplexity ~10/answer vs ChatGPT ~2) and raw counts are not
 *   comparable across engines.
 */

import { shareCI, type ShareCI } from "./stats";
import { isBrandedQuery, type BrandIdentity } from "./brand-tags";

export interface VisibilityCheckRow {
  query: string;
  provider: string;
  grounding: "live" | "memory";
  mentionsDomain: boolean;
  citationsForDomain: number;
  /** Total citations in that answer (all domains). */
  citationsCount: number;
  sentiment: string | null;
  error: string | null;
}

export interface VisibilitySlice {
  checks: number;
  mentions: number;
  mentionRate: ShareCI;
  citationRate: ShareCI;
  /** Client's share of all cited URLs. Null when no citations exist. */
  citationShare: number | null;
  sentiment: Record<"positive" | "neutral" | "negative" | "mixed", number>;
}

function emptySentiment(): VisibilitySlice["sentiment"] {
  return { positive: 0, neutral: 0, negative: 0, mixed: 0 };
}

function slice(rows: VisibilityCheckRow[], scopeKey: string): VisibilitySlice {
  const ok = rows.filter((r) => r.error === null);
  const live = ok.filter((r) => r.grounding === "live");
  const sentiment = emptySentiment();
  let citedByDomain = 0;
  let citedTotal = 0;
  for (const r of live) {
    if (r.mentionsDomain && r.sentiment && r.sentiment in sentiment) {
      sentiment[r.sentiment as keyof VisibilitySlice["sentiment"]] += 1;
    }
    citedByDomain += r.citationsForDomain;
    citedTotal += r.citationsCount;
  }
  return {
    checks: live.length,
    mentions: live.filter((r) => r.mentionsDomain).length,
    mentionRate: shareCI(
      live.map((r) => r.mentionsDomain),
      `${scopeKey}:mention`,
    ),
    citationRate: shareCI(
      live.map((r) => r.citationsForDomain > 0),
      `${scopeKey}:citation`,
    ),
    citationShare: citedTotal > 0 ? citedByDomain / citedTotal : null,
    sentiment,
  };
}

export interface VisibilitySummary {
  /** Headline: live-grounded answers only. */
  live: VisibilitySlice;
  /** Ungrounded (model memory) answers, reported separately — never mixed. */
  memory: { checks: number; mentions: number };
  failed: number;
  perProvider: { provider: string; slice: VisibilitySlice }[];
  branded: VisibilitySlice;
  nonBranded: VisibilitySlice;
}

export function summarizeVisibility(
  rows: VisibilityCheckRow[],
  identity: BrandIdentity,
  scopeKey = "all",
): VisibilitySummary {
  const brandedRows: VisibilityCheckRow[] = [];
  const nonBrandedRows: VisibilityCheckRow[] = [];
  for (const r of rows) {
    (isBrandedQuery(r.query, identity) ? brandedRows : nonBrandedRows).push(r);
  }

  const providers = [...new Set(rows.map((r) => r.provider))].sort();
  return {
    live: slice(rows, `${scopeKey}:live`),
    memory: {
      checks: rows.filter((r) => r.error === null && r.grounding === "memory").length,
      mentions: rows.filter((r) => r.error === null && r.grounding === "memory" && r.mentionsDomain).length,
    },
    failed: rows.filter((r) => r.error !== null).length,
    perProvider: providers.map((provider) => ({
      provider,
      slice: slice(
        rows.filter((r) => r.provider === provider),
        `${scopeKey}:${provider}`,
      ),
    })),
    branded: slice(brandedRows, `${scopeKey}:branded`),
    nonBranded: slice(nonBrandedRows, `${scopeKey}:nonbranded`),
  };
}

/** Rows in the last N days vs the window before it — trend direction. */
export function trendDelta(
  recent: number,
  previous: number,
): "up" | "down" | "flat" | null {
  if (!Number.isFinite(previous) || !Number.isFinite(recent)) return null;
  if (previous === 0 && recent === 0) return "flat";
  if (previous === 0) return "up";
  const change = (recent - previous) / previous;
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "flat";
}
