/**
 * Publish pipeline for factory articles: markdown → SEO-complete static
 * HTML page → skoob.cc production (same patch channel as prerender) →
 * Baidu push for instant indexing.
 *
 * Pages live under /blog/<id>.html — deterministic, idempotent (same
 * article republishes over itself), and Baidu accepts .html URLs happily.
 */

import { marked } from "marked";

export const SITE = "https://skoob.cc";
export const GOOGLE_VERIFICATION = "qqz0fDba2kS-rqUgO33YDS2gF7IY7W6nqTLpBPhK9Yc";
export const BAIDU_VERIFICATION = "codeva-mTLC0XktVP";

export function blogUrl(articleId: number): string {
  return `${SITE}/blog/${articleId}.html`;
}

export function articleSlugPath(articleId: number): string {
  return `blog/${articleId}.html`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstParagraph(markdown: string): string {
  const para = markdown
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#{1,6}\s*/, "").trim())
    .find((p) => p.length > 30);
  return (para ?? markdown).slice(0, 160);
}

export interface RenderedArticle {
  html: string;
  url: string;
  path: string;
  title: string;
  description: string;
}

/** Render one article as a full, crawlable, self-contained page. */
export function renderArticleHtml(article: {
  id: number;
  title: string;
  contentMd: string;
}): RenderedArticle {
  const url = blogUrl(article.id);
  const body = marked.parse(article.contentMd, { async: false }) as string;
  const description = firstParagraph(article.contentMd);
  const today = new Date().toISOString().slice(0, 10);
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="google-site-verification" content="${GOOGLE_VERIFICATION}" />
<meta name="baidu-site-verification" content="${BAIDU_VERIFICATION}" />
<title>${escapeHtml(article.title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${url}" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(article.title)},"description":${JSON.stringify(description)},"url":"${url}","datePublished":"${today}","dateModified":"${today}","inLanguage":"zh-CN","author":{"@type":"Organization","name":"焚诀 Skoob"},"publisher":{"@type":"Organization","name":"焚诀 Skoob"}}
</script>
<style>
body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:760px;margin:0 auto;padding:2rem 1.25rem;line-height:1.8;color:#24292f}
h1{font-size:1.7rem;line-height:1.4}h2{font-size:1.3rem;margin-top:2em;border-bottom:1px solid #eee;padding-bottom:.3em}
pre{background:#f6f8fa;padding:1rem;overflow:auto;border-radius:8px}code{background:#f6f8fa;padding:.15em .35em;border-radius:4px}
img{max-width:100%}a{color:#0969da}
.nav{border-bottom:1px solid #eee;padding-bottom:1rem;margin-bottom:2rem}
.nav a{margin-right:1.2rem;text-decoration:none}
footer{margin-top:3rem;border-top:1px solid #eee;padding-top:1rem;color:#666;font-size:.85rem}
</style>
</head>
<body>
<nav class="nav">
<a href="/">焚诀 Skoob</a>
<a href="/site">产品介绍</a>
<a href="/site/docs">文档</a>
<a href="/pricing">定价</a>
</nav>
<main>
${body}
</main>
<footer>
<p>© ${new Date().getFullYear()} 煊光（杭州）智能科技有限公司 · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2026010374号-3</a></p>
<p><a href="/">← 返回焚诀 Skoob 首页</a> · 本站还有 <a href="/site">产品官网</a> 与 <a href="/site/docs">开发者文档</a></p>
</footer>
</body>
</html>`;
  return { html, url, path: articleSlugPath(article.id), title: article.title, description };
}

export interface BaiduPushResult {
  ok: boolean;
  detail: string;
}

/** Baidu instant-indexing push. Injectable fetch for tests. */
export async function baiduPush(
  urls: string[],
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BaiduPushResult> {
  if (urls.length === 0 || !token) {
    return { ok: false, detail: "no urls or token" };
  }
  try {
    const res = await fetchImpl(
      `http://data.zz.baidu.com/urls?site=https://skoob.cc&token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: urls.join("\n"),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const body = (await res.json()) as { success?: number; error?: number; message?: string };
    if (typeof body.success === "number") {
      return { ok: true, detail: `success=${body.success}` };
    }
    if (body.message?.includes("over quota")) {
      return { ok: false, detail: "over quota (daily limit, retry tomorrow)" };
    }
    return { ok: false, detail: body.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
