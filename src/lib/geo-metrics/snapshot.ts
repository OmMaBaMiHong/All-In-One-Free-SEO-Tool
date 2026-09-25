/**
 * Snapshot pipeline: aggregate the client's raw checks into one trend row
 * (and compare it against the previous snapshot for the dashboard delta).
 *
 * Kept thin on purpose: the aggregation math lives in metrics.ts/rank.ts
 * (pure, tested); this module is DB I/O + one pure compare helper that IS
 * unit-tested. Failures here must never break a check run — callers wrap
 * in catch.
 */

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  aiVisibilityChecks,
  clients,
  keywords,
  geoVisibilitySnapshots,
} from "../../db/schema";
import type { InferSelectModel } from "drizzle-orm";

type GeoVisibilitySnapshot = InferSelectModel<typeof geoVisibilitySnapshots>;
import { summarizeVisibility, type VisibilityCheckRow } from "./metrics";
import { mrr } from "./rank";
import { brandTerms } from "./brand-tags";

export interface SnapshotDelta {
  mentionRateDelta: number | null;
  mrrDelta: number | null;
  direction: "up" | "down" | "flat" | null;
}

/** Trend direction with a 5% relative band — noise is not a trend. */
export function compareSnapshots(
  prev: Pick<GeoVisibilitySnapshot, "mentionRate" | "mrr">,
  next: Pick<GeoVisibilitySnapshot, "mentionRate" | "mrr">,
): SnapshotDelta {
  const rateDelta =
    prev.mentionRate !== null && next.mentionRate !== null
      ? next.mentionRate - prev.mentionRate
      : null;
  const mrrDelta =
    prev.mrr !== null && next.mrr !== null ? next.mrr - prev.mrr : null;
  const reference = rateDelta ?? mrrDelta;
  let direction: SnapshotDelta["direction"] = null;
  if (reference !== null && prev.mentionRate !== null && prev.mentionRate > 0) {
    const rel = rateDelta !== null ? rateDelta / prev.mentionRate : 0;
    if (rel > 0.05) direction = "up";
    else if (rel < -0.05) direction = "down";
    else direction = "flat";
  }
  return { mentionRateDelta: rateDelta, mrrDelta, direction };
}

export interface SnapshotResult {
  snapshot: GeoVisibilitySnapshot;
  previous: GeoVisibilitySnapshot | null;
  delta: SnapshotDelta;
}

/**
 * Aggregate every check for this client into one snapshot row. Call at
 * the end of a full check run (or on demand from the UI).
 */
export async function snapshotClientVisibility(
  clientId: number,
): Promise<SnapshotResult | null> {
  const [client] = await db
    .select({ name: clients.name, url: clients.url, brandAliases: clients.brandAliases })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client?.url) return null;

  const tracked = await db
    .select({ id: keywords.id, query: keywords.query })
    .from(keywords)
    .where(eq(keywords.clientId, clientId));
  if (tracked.length === 0) return null;

  const checks = await db
    .select()
    .from(aiVisibilityChecks)
    .where(inArray(aiVisibilityChecks.keywordId, tracked.map((k) => k.id)));

  const queryById = new Map(tracked.map((k) => [k.id, k.query]));
  const rows: VisibilityCheckRow[] = checks.map((c) => ({
    query: queryById.get(c.keywordId) ?? "",
    provider: c.provider,
    grounding: c.grounding,
    mentionsDomain: c.mentionsDomain,
    citationsForDomain: c.citationsForDomain,
    citationsCount: Array.isArray(c.citations) ? c.citations.length : 0,
    sentiment: c.sentiment,
    error: c.error,
    rank: c.rank ?? null,
  }));

  const identity = {
    clientName: client.name,
    domain: client.url,
    aliases: client.brandAliases,
  };
  const summary = summarizeVisibility(rows, identity, `client-${clientId}`);
  const rankRows = checks
    .filter(
      (c) =>
        c.mentionsDomain && c.grounding === "live" && typeof c.rank === "number" && !c.error,
    )
    .map((c) => ({ rank: c.rank as number }));
  const mrrValue = mrr(rankRows);
  const avgRank =
    rankRows.length > 0
      ? rankRows.reduce((s, r) => s + r.rank, 0) / rankRows.length
      : null;

  const [previous] = await db
    .select()
    .from(geoVisibilitySnapshots)
    .where(eq(geoVisibilitySnapshots.clientId, clientId))
    .orderBy(desc(geoVisibilitySnapshots.capturedAt))
    .limit(1);

  const [snapshot] = await db
    .insert(geoVisibilitySnapshots)
    .values({
      clientId,
      checks: summary.live.checks,
      mentions: summary.live.mentions,
      failed: summary.failed,
      mentionRate: summary.live.mentionRate.point,
      mentionLow: summary.live.mentionRate.low,
      mentionHigh: summary.live.mentionRate.high,
      citationShare: summary.live.citationShare,
      mrr: mrrValue,
      avgRank,
      brandedChecks: summary.branded.checks,
      brandedMentions: summary.branded.mentions,
      nonBrandedChecks: summary.nonBranded.checks,
      nonBrandedMentions: summary.nonBranded.mentions,
    })
    .returning();

  const delta = previous
    ? compareSnapshots(previous, snapshot)
    : { mentionRateDelta: null, mrrDelta: null, direction: null };

  return { snapshot, previous: previous ?? null, delta };
}

export { brandTerms };
