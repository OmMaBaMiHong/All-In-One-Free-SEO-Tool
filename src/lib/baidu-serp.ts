/**
 * Baidu SERP parsing and rank checking helpers.
 *
 * Why this exists: the 60 zh keywords tracked for skoob rank on Baidu, not
 * Google — Baiduspider/Baidu-index rules are a different market (see
 * HeiGe cn-layer) and Google-only tracking reported nothing useful for
 * them. This module is the parse/unwrap half; wiring into the daily cron
 * lands separately so the parse logic can be tested against a real
 * captured SERP first (src/lib/__fixtures__/baidu-serp.html).
 *
 * Baidu SERP facts this is written against (captured 2026-09-25):
 * - Organic results appear in document order as <h3><a href="...">标题</a>.
 * - Almost every link href is a redirect: http://www.baidu.com/link?url=…
 *   The real target is only known after following the redirect (a 302).
 * - A few results link directly (e.g. shouji.baidu.com app pages).
 * - Baidu sometimes shows a captcha page instead of results; callers must
 *   detect that upstream (this module simply returns 0 results).
 */

import { normalizeDomain, urlMatches } from "./rank-checker";

export interface BaiduResultEntry {
  /** 1-based position in the parsed organic order. */
  position: number;
  title: string;
  /** href as-is: usually a http://www.baidu.com/link?url=… redirect. */
  href: string;
  isRedirect: boolean;
}

const TITLE_LINK_RE =
  /<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

export function isBaiduRedirectUrl(href: string): boolean {
  return /^https?:\/\/[^/]*baidu\.com\/link\?/i.test(href);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Parse the organic result order out of a Baidu SERP HTML document. */
export function extractBaiduResults(html: string): BaiduResultEntry[] {
  const out: BaiduResultEntry[] = [];
  for (const m of html.matchAll(TITLE_LINK_RE)) {
    const href = decodeEntities(m[1]).trim();
    const title = stripTags(m[2]);
    if (!href || href.startsWith("//") || href.startsWith("#")) continue;
    if (/^https?:\/\/[^/]*baidu\.com\/(s|link)?[?/]?(wd=|$)/i.test(href)) continue;
    out.push({
      position: out.length + 1,
      title,
      href,
      isRedirect: isBaiduRedirectUrl(href),
    });
  }
  return out;
}

/**
 * Resolve a http://www.baidu.com/link?url=… redirect to its final URL.
 * Baidu answers with a single 302 + Location; relative locations are
 * resolved against the link URL. Returns null on any failure — callers
 * treat that as "unknown, keep walking".
 */
export async function unwrapBaiduUrl(
  href: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetchImpl(href, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, href).toString();
        if (!/baidu\.com\/link\?/i.test(next)) return next;
        href = next; // chained baidu redirects do occur
        continue;
      }
      // Non-redirect response: the final URL is what we asked for.
      return res.url && !res.url.includes("baidu.com/link?") ? res.url : null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface BaiduScanResult {
  position: number | null;
  url: string | null;
  /** How many organic results were walked (matched or not). */
  resultsScanned: number;
}

/**
 * Walk the parsed results in order; the first result whose (unwrapped)
 * URL matches `domain` wins. Unwrapping stops at the match — no point
 * paying for redirects below the hit.
 */
export async function readBaiduResponse(
  html: string,
  domain: string,
  options: { unwrapLimit?: number; unwrap?: typeof unwrapBaiduUrl } = {},
): Promise<BaiduScanResult> {
  const unwrapLimit = options.unwrapLimit ?? 30;
  const unwrap = options.unwrap ?? unwrapBaiduUrl;
  const results = extractBaiduResults(html);
  let unwrapped = 0;
  for (const r of results) {
    let href: string | null = r.href;
    if (r.isRedirect) {
      if (unwrapped >= unwrapLimit) continue;
      unwrapped += 1;
      href = await unwrap(r.href);
      if (!href) continue;
    }
    if (urlMatches(href, domain)) {
      return { position: r.position, url: href, resultsScanned: r.position };
    }
  }
  return { position: null, url: null, resultsScanned: results.length };
}
