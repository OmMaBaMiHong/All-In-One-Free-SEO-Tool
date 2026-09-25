/**
 * Keyword recall scoring for the unified knowledge base (V1, vector-free).
 *
 * Query terms are expanded: latin words lowercased + CJK text into
 * overlapping bigrams (single CJK chars are too ambiguous; whole
 * sentences too sparse). A chunk scores by weighted term coverage —
 * rarer terms weigh more (1/log(df-ish) approximated by length: longer
 * CJK bigrams and longer latin words are more informative).
 *
 * Same scoring rules must stay deterministic — tests pin them.
 */

export interface ScoredChunk<T> {
  item: T;
  score: number;
  matchedTerms: string[];
}

/** Latin words + CJK bigrams from mixed text. */
export function extractTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z0-9][A-Za-z0-9'-]*/g)) {
    const w = m[0].toLowerCase();
    if (w.length >= 2) terms.add(w);
  }
  const cjkRuns = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length === 1) {
      terms.add(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      terms.add(run.slice(i, i + 2));
    }
  }
  return [...terms];
}

/** Weight of one matched term: longer = rarer = more informative. */
function termWeight(term: string): number {
  const cjk = /[\u4e00-\u9fff]/.test(term);
  if (cjk) return Math.min(3, term.length); // bigram 2, trigram 3
  return term.length >= 6 ? 2.5 : term.length >= 4 ? 1.6 : 1;
}

export function scoreText(chunkContent: string, queryTerms: string[]): {
  score: number;
  matchedTerms: string[];
} {
  const lower = chunkContent.toLowerCase();
  let score = 0;
  const matched: string[] = [];
  for (const term of queryTerms) {
    if (lower.includes(term.toLowerCase())) {
      score += termWeight(term);
      matched.push(term);
    }
  }
  // Slight length normalisation: a 200-char chunk matching 3 terms is
  // denser evidence than a 5000-char chunk matching the same 3.
  const norm = 1 + Math.log10(Math.max(80, chunkContent.length) / 80) * 0.3;
  return { score: score / norm, matchedTerms: matched };
}

export function rankChunks<T extends { content: string }>(
  chunks: T[],
  query: string,
): ScoredChunk<T>[] {
  const queryTerms = extractTerms(query);
  if (queryTerms.length === 0) return [];
  const scored = chunks
    .map((item) => {
      const { score, matchedTerms } = scoreText(item.content, queryTerms);
      return { item, score, matchedTerms };
    })
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
