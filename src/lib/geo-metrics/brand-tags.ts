/**
 * Branded vs non-branded query classification for AI-visibility tracking.
 *
 * Why the split matters (the whole reason this exists): a branded query
 * ("焚诀 Skoob") measures whether AIs have *heard of you*; a non-branded
 * query ("AI 写小说") measures whether AIs *recommend you unprompted*.
 * Mixing them into one "visibility %" flatters the number and hides the
 * harder half of the problem. GEO tooling calls this the branded/unbranded
 * split; we derive it locally from client identity data.
 */

export interface BrandIdentity {
  clientName: string;
  /** e.g. "skoob.cc" — bare hostname, no scheme or path. */
  domain: string;
  /** Extra brand terms from the client row (JSON array column). */
  aliases?: string[] | null;
}

/** CJK-aware token extraction: latin words as-is; CJK runs kept whole. */
function extractTokens(input: string): string[] {
  const tokens: string[] = [];
  // Latin/digit words.
  for (const m of input.matchAll(/[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]|[A-Za-z0-9]/g)) {
    const t = m[0].toLowerCase();
    if (t.length >= 2 || /^[a-z0-9]$/.test(t)) tokens.push(t);
  }
  // CJK runs (simplified + traditional + kana) stay as whole units —
  // splitting "焚诀" into single characters would match far too broadly.
  for (const m of input.matchAll(/[\u4e00-\u9fff\u3040-\u30ff]+/g)) {
    if (m[0].length >= 2) tokens.push(m[0]);
  }
  return tokens;
}

/**
 * All brand terms a mention could use, lowercased. Domain is included both
 * bare ("skoob.cc") and split ("skoob") — answers say both.
 */
export function brandTerms(identity: BrandIdentity): string[] {
  const terms = new Set<string>();
  for (const t of extractTokens(identity.clientName ?? "")) terms.add(t);
  const host = (identity.domain ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
  if (host) {
    terms.add(host);
    const label = host.split(".")[0];
    if (label && label.length >= 3) terms.add(label);
  }
  for (const alias of identity.aliases ?? []) {
    const a = alias.trim().toLowerCase();
    if (a) terms.add(a);
    for (const t of extractTokens(alias)) terms.add(t);
  }
  // A 1–2 letter noise token like "da" (from a placeholder client name)
  // would brand half the Chinese internet. Length floor applies to the
  // name-derived tokens; explicit aliases are trusted as-is above.
  return [...terms].filter((t) => t.length >= 3 || /[\u4e00-\u9fff]/.test(t));
}

/**
 * A query is branded when it contains any brand term. Case-insensitive;
 * substring match is deliberate — word boundaries don't exist in Chinese,
 * and latin brand names appear glued to suffixes ("skoob的").
 */
export function isBrandedQuery(query: string, identity: BrandIdentity): boolean {
  const q = query.toLowerCase();
  return brandTerms(identity).some((t) => q.includes(t));
}

/** Split a list of queries into { branded, nonBranded } keyword-id buckets. */
export function partitionByBrand<T extends { query: string }>(
  items: T[],
  identity: BrandIdentity,
): { branded: Set<string>; nonBranded: Set<string> } {
  const branded = new Set<string>();
  const nonBranded = new Set<string>();
  for (const item of items) {
    (isBrandedQuery(item.query, identity) ? branded : nonBranded).add(item.query);
  }
  return { branded, nonBranded };
}
