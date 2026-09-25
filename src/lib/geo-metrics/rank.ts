/**
 * Semantic rank judge — the MRR half of the GEO metrics kernel (ported
 * from geobench's rank module, where the hard-won lessons live):
 *
 * - Rank means "semantic endorsement position", NOT list position. "Its
 *   feature table is first" is not rank 1; "the tool I'd pick first" is.
 * - Evidence contract: every cited evidence span must be a LITERAL
 *   substring of the model's answer. Judge output that hallucinates its
 *   evidence is invalidated wholesale (rank_source="judge_invalid") —
 *   an unverifiable rank is worse than no rank, because dashboards
 *   repeat it forever.
 * - A deterministic ordinal parser runs as audit-only sidecar
 *   (deterministic_rank / agrees_with_judge) and NEVER overrides the
 *   judge — it exists to calibrate and to catch judge drift.
 *
 * Pure logic is separated from the LLM call so tests can mock the judge;
 * production wires callAI (see judgeRank's default dependency).
 */

import { callAI } from "../ai-call";

export type AnswerIntent =
  | "recommendation"
  | "comparison"
  | "neutral_info"
  | "unknown";

export type RankSource =
  | "judge" // validated: rank + ≥1 literal evidence span
  | "judge_invalid" // judge answered but failed the evidence contract
  | "none"; // no usable judge output (error / unparseable)

export interface RankJudgment {
  /** 1-based semantic endorsement position; null when not ranked/mentioned. */
  rank: number | null;
  /** Literal spans of the answer backing the rank. */
  evidence: string[];
  intent: AnswerIntent;
  source: RankSource;
  /** Audit-only ordinal scan result (never overrides rank). */
  deterministicRank: number | null;
  deterministicAgrees: boolean | null;
  reason?: string;
}

// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------

export function buildJudgeMessages(
  query: string,
  response: string,
  brandTerms: string[],
): { system: string; user: string } {
  const system = `You are a strict evaluation judge for AI-search visibility (GEO).
You will be given: a user's original question, an AI assistant's full answer, and a brand's name/aliases.

Decide the brand's SEMANTIC ENDORSEMENT RANK in the answer:
- Rank = the position at which the answer ENDORSES the brand as an answer to the question
  (e.g. "the tool I'd pick first" = rank 1), NOT its position in a feature table or layout.
- If the answer compares options, rank = the brand's standing in that comparison.
- If the answer merely mentions the brand without any endorsement ordering, rank = null.
- If the answer does not mention the brand at all, rank = null.

Evidence contract (strict):
- Every evidence string MUST be a LITERAL substring copied verbatim from the answer.
- Provide 1-3 short spans (one sentence or less each) that justify the rank.
- If rank is null, evidence must be [].

Also classify the answer's intent: "recommendation" (it recommends tools/options),
"comparison" (it compares options), "neutral_info" (explains without ordering), or "unknown".

Respond with ONLY this JSON object:
{"rank": <integer|null>, "intent": "recommendation"|"comparison"|"neutral_info"|"unknown", "evidence": ["<verbatim span>", ...], "reason": "<max 20 words>"}`;

  const user = `Original question: ${query}

Brand terms (any alias counts as the brand): ${brandTerms.join(" | ")}

AI assistant's answer:
"""
${response.slice(0, 6000)}
"""

Return ONLY the JSON object.`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// parsing + evidence validation
// ---------------------------------------------------------------------------

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asLiteralSpans(value: unknown, response: string): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const e of value) {
    if (typeof e !== "string") continue;
    const span = e.trim();
    if (span.length >= 2 && response.includes(span)) out.push(span);
  }
  return out;
}

function coerceRank(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n >= 1 ? n : "invalid";
  }
  return "invalid";
}

/**
 * Validate a raw judge completion against the answer. Returns a judgment
 * with source="judge" only when rank and its evidence survive the contract.
 */
export function parseJudgeOutput(
  raw: string,
  response: string,
): Pick<RankJudgment, "rank" | "evidence" | "intent" | "source" | "reason"> {
  const obj = extractJsonObject(raw);
  if (!obj) {
    return { rank: null, evidence: [], intent: "unknown", source: "none", reason: "unparseable judge output" };
  }
  const rank = coerceRank(obj.rank);
  const evidence = asLiteralSpans(obj.evidence, response);
  const intentRaw = typeof obj.intent === "string" ? obj.intent : "unknown";
  const allowed: readonly string[] = ["recommendation", "comparison", "neutral_info"];
  const intent: AnswerIntent = allowed.includes(intentRaw)
    ? (intentRaw as AnswerIntent)
    : "unknown";
  const reason = typeof obj.reason === "string" ? obj.reason.slice(0, 140) : undefined;

  if (rank === "invalid") {
    return { rank: null, evidence: [], intent, source: "judge_invalid", reason: reason ?? "rank not a positive integer" };
  }
  if (rank === null) {
    // "not ranked" is a valid judgment even without evidence.
    return { rank: null, evidence: [], intent, source: "judge", reason };
  }
  if (evidence.length === 0) {
    // A rank with zero literal evidence is exactly the hallucination the
    // contract exists to stop.
    return { rank: null, evidence: [], intent, source: "judge_invalid", reason: reason ?? "rank without literal evidence" };
  }
  return { rank, evidence, intent, source: "judge", reason };
}

// ---------------------------------------------------------------------------
// deterministic ordinal sidecar (audit-only)
// ---------------------------------------------------------------------------

const CN_ORDINALS: [RegExp, number][] = [
  [/排名第一|第1[名个位]?|第一名|首推|首选|最推荐/, 1],
  [/排名第二|第2[名个位]?|第二名/, 2],
  [/排名第三|第3[名个位]?|第三名/, 3],
  [/排名第四|第4[名个位]?|第四名/, 4],
  [/排名第五|第5[名个位]?|第五名/, 5],
];

/** Find an ordinal rank near any brand term. Audit-only; may return null. */
export function deterministicRank(
  response: string,
  brandTerms: string[],
): number | null {
  const sentences = response.split(/[。！？!?\n]+/).map((s) => s.trim());
  for (const s of sentences) {
    const hasBrand = brandTerms.some((t) => t && s.toLowerCase().includes(t.toLowerCase()));
    if (!hasBrand) continue;
    for (const [re, n] of CN_ORDINALS) {
      if (re.test(s)) return n;
    }
    // numbered list marker inside the sentence: "1. 焚诀…" / "1、…" / "①"
    const m = s.match(/^\s*(\d{1,2})[.、)]\s*/) ?? s.match(/^[①②③④⑤⑥⑦⑧⑨⑩]/);
    if (m) {
      const n = m[1] ? Number(m[1]) : "①②③④⑤⑥⑦⑧⑨⑩".indexOf(m[0]) + 1;
      if (n >= 1 && n <= 10) return n;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// orchestration
// ---------------------------------------------------------------------------

export async function judgeRank(
  query: string,
  response: string,
  brandTerms: string[],
  deps: {
    judge?: (system: string, user: string) => Promise<string | null>;
    now?: () => void;
  } = {},
): Promise<RankJudgment> {
  const deterministic = deterministicRank(response, brandTerms);
  const { system, user } = buildJudgeMessages(query, response, brandTerms);

  let raw: string | null = null;
  try {
    raw = deps.judge
      ? await deps.judge(system, user)
      : await callAI({
          system,
          user,
          maxTokens: 400,
          temperature: 0,
          timeoutMs: 30_000,
        });
  } catch {
    raw = null;
  }

  if (!raw) {
    return {
      rank: null, evidence: [], intent: "unknown", source: "none",
      deterministicRank: deterministic, deterministicAgrees: null,
      reason: "judge unavailable",
    };
  }

  const parsed = parseJudgeOutput(raw, response);
  return {
    ...parsed,
    deterministicRank: deterministic,
    deterministicAgrees:
      deterministic !== null && parsed.rank !== null ? deterministic === parsed.rank : null,
  };
}

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

/** Mean Reciprocal Rank over judgments (null/none contribute 0 to the numerator). */
export function mrr(judgments: { rank: number | null }[]): number | null {
  if (judgments.length === 0) return null;
  const sum = judgments.reduce((s, j) => s + (j.rank && j.rank > 0 ? 1 / j.rank : 0), 0);
  return sum / judgments.length;
}

export function intentDistribution(
  judgments: { intent: AnswerIntent }[],
): Record<AnswerIntent, number> {
  const out: Record<AnswerIntent, number> = {
    recommendation: 0, comparison: 0, neutral_info: 0, unknown: 0,
  };
  for (const j of judgments) out[j.intent] += 1;
  return out;
}
