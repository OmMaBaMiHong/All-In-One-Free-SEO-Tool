/**
 * FAQPage generator — turns a page/content into publish-ready FAQ assets:
 * validated Q&A pairs → FAQPage JSON-LD (the cn-audit's top missing item,
 * measured ~2.7x citation lift) + a visible HTML section.
 *
 * Pure logic here (prompt/parse/validate/build); the tool action wires
 * content extraction and callAI.
 */

export interface FaqPair {
  question: string;
  answer: string;
}

export function buildFaqMessages(
  content: string,
  opts: { count?: number; languageHint?: string } = {},
): { system: string; user: string } {
  const count = opts.count ?? 6;
  const system = `You are an FAQ generator for AI-search visibility (GEO).
From the given content, derive the ${count} questions a real user would most likely ask, and answer each
directly from the content only.

Rules:
- Questions: how real users search (include "怎么/什么/为什么" style phrasing when content is Chinese).
- Answers: 60-120 characters (CJK) each, self-contained, factually grounded in the content, no fluff.
- Never invent facts absent from the content. If content is thin, return fewer FAQs.

Respond with ONLY this JSON:
{"faqs":[{"question":"...","answer":"..."}]}`;

  const user = `Content (language: ${opts.languageHint ?? "auto"}):
"""
${content.slice(0, 9000)}
"""

Return ONLY the JSON object.`;

  return { system, user };
}

export function parseFaqOutput(raw: string): { faqs: FaqPair[]; dropped: number } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { faqs: [], dropped: 0 };
  let obj: { faqs?: unknown };
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { faqs: [], dropped: 0 };
  }
  const list = Array.isArray(obj.faqs) ? obj.faqs : [];
  const faqs: FaqPair[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const item of list) {
    const q = typeof item?.question === "string" ? item.question.trim() : "";
    const a = typeof item?.answer === "string" ? item.answer.trim() : "";
    if (q.length < 5 || a.length < 20) {
      dropped += 1;
      continue;
    }
    const key = q.toLowerCase();
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    faqs.push({ question: q, answer: a });
  }
  return { faqs, dropped };
}

/** FAQPage JSON-LD, schema.org compliant. */
export function buildFaqJsonLd(faqs: FaqPair[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  });
}

/** Visible HTML section (the answers are the GEO payload — AI cites text). */
export function buildFaqHtml(faqs: FaqPair[]): string {
  return faqs
    .map(
      (f) =>
        `<section>\n  <h2>${f.question}</h2>\n  <p>${f.answer}</p>\n</section>`,
    )
    .join("\n");
}
