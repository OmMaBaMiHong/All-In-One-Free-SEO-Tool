/**
 * GEU guard — rewrite quality verification (the GEU half of geobench's
 * evaluation kernel, distilled).
 *
 * Why it exists: the rewrite-instruction compiler hands a page to an LLM
 * with one goal — higher AI visibility. An LLM chasing that goal can
 * quietly wreck the page: invent numbers to hit "fact density", drop
 * caveats to sound confident, pad to a word-count target. GEU is the
 * gate AFTER the rewrite:
 *
 * - factConsistency 40 — numbers/dates/names/claims preserved; invented
 *   facts are the single worst failure and cap the verdict at fail
 * - completeness 30 — key information survived the rewrite
 * - readability 30 — clear, structured, natural; AI-slop patterns cost
 *
 * Verdict is recomputed in code from the dimension scores (the judge's
 * own verdict is advisory). `source:"none"` means the judge was
 * unavailable — callers must treat that as "not verified", never pass.
 */

import { callAI } from "../ai-call";

export interface GeuDimension {
  score: number;
  max: number;
  issues: string[];
}

export interface GeuVerdict {
  total: number;
  verdict: "pass" | "fail";
  factConsistency: GeuDimension;
  completeness: GeuDimension;
  readability: GeuDimension;
  source: "judge" | "none";
  reason?: string;
}

const PASS_TOTAL = 75;
const FACT_MIN = 35;

export function buildGeuMessages(
  original: string,
  rewritten: string,
): { system: string; user: string } {
  const system = `You are a strict rewrite-quality judge (GEU: Generative-engine Utility guard).
You will see an ORIGINAL text and a REWRITTEN version (optimized for AI-search visibility).

Score three dimensions, each 0 to its max, using ONLY what you can verify:

1. factConsistency (max 40) — Are all facts preserved? Every number, date, name, price and claim in
   the original must survive unchanged in the rewrite. Invented facts, changed numbers, or dropped
   qualifiers cost heavily. List each violation in issues[] (quote the conflicting part).
2. completeness (max 30) — Does the rewrite keep the original's key information (topics covered,
   caveats, concrete examples)? List anything important that disappeared.
3. readability (max 30) — Is the rewrite clear, well-structured and natural? AI-slop patterns
   ("总之", "综上所述", "在当今时代", forced parallelism, keyword stuffing) cost points.

Scoring honesty: use the full range. A mediocre rewrite is 15-22 per 30-point dimension, not 26.
Deduct precisely; do not grade on a curve.

Respond with ONLY this JSON:
{"factConsistency":{"score":<0-40>,"issues":["..."]},"completeness":{"score":<0-30>,"issues":["..."]},"readability":{"score":<0-30>,"issues":["..."]},"reason":"<max 20 words>"}`;

  const user = `ORIGINAL:
"""
${original.slice(0, 6000)}
"""

REWRITTEN:
"""
${rewritten.slice(0, 6000)}
"""

Return ONLY the JSON object.`;

  return { system, user };
}

function clampScore(value: unknown, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function readDimension(obj: Record<string, unknown>, key: string, max: number): GeuDimension {
  const raw = obj[key];
  const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    score: clampScore(d.score, max),
    max,
    issues: Array.isArray(d.issues)
      ? d.issues.filter((i): i is string => typeof i === "string").slice(0, 8)
      : [],
  };
}

export function parseGeuOutput(raw: string): Omit<GeuVerdict, "source"> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const factConsistency = readDimension(obj, "factConsistency", 40);
  const completeness = readDimension(obj, "completeness", 30);
  const readability = readDimension(obj, "readability", 30);
  const total =
    factConsistency.score + completeness.score + readability.score;
  // Verdict recomputed here — the judge's opinion of pass/fail is not trusted.
  const verdict: "pass" | "fail" =
    total >= PASS_TOTAL && factConsistency.score >= FACT_MIN ? "pass" : "fail";
  return {
    total,
    verdict,
    factConsistency,
    completeness,
    readability,
    reason: typeof obj.reason === "string" ? obj.reason.slice(0, 140) : undefined,
  };
}

export async function geuCheck(
  original: string,
  rewritten: string,
  deps: { judge?: (system: string, user: string) => Promise<string | null> } = {},
): Promise<GeuVerdict> {
  const { system, user } = buildGeuMessages(original, rewritten);
  let raw: string | null = null;
  try {
    raw = deps.judge
      ? await deps.judge(system, user)
      : await callAI({ system, user, maxTokens: 600, temperature: 0, timeoutMs: 45_000 });
  } catch {
    raw = null;
  }
  if (!raw) {
    return {
      total: 0,
      verdict: "fail",
      factConsistency: { score: 0, max: 40, issues: [] },
      completeness: { score: 0, max: 30, issues: [] },
      readability: { score: 0, max: 30, issues: [] },
      source: "none",
      reason: "judge unavailable — rewrite NOT verified",
    };
  }
  const parsed = parseGeuOutput(raw);
  return parsed
    ? { ...parsed, source: "judge" }
    : {
        total: 0, verdict: "fail",
        factConsistency: { score: 0, max: 40, issues: [] },
        completeness: { score: 0, max: 30, issues: [] },
        readability: { score: 0, max: 30, issues: [] },
        source: "none", reason: "unparseable judge output — rewrite NOT verified",
      };
}
