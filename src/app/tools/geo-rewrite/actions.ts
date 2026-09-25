"use server";

import { guardedFetch } from "@/lib/url-guard";
import { callAI } from "@/lib/ai-call";
import { auditGeo, type Market } from "@/lib/geo-audit-kernel";
import {
  compileRewriteInstructions,
  type RewritePackage,
} from "@/lib/geo-metrics/rewrite-instructions";
import { geuCheck, type GeuVerdict } from "@/lib/geo-metrics/geu";
import { parseHtmlToMarkdown } from "@/lib/main-content-extractor";

export type GeoRewriteState =
  | {
      ok: true;
      url: string;
      market: Market;
      audit: {
        cn: { total: number; geoScore: number; seoScore: number };
        global: { total: number; geoScore: number; seoScore: number };
      };
      instructions: RewritePackage;
      rewritten: string;
      geu: GeuVerdict;
      note: string;
    }
  | { ok: false; error: string }
  | null;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

async function fetchText(url: string, timeoutMs = 12_000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await guardedFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function runGeoRewrite(
  _prev: GeoRewriteState,
  formData: FormData,
): Promise<GeoRewriteState> {
  const urlRaw = String(formData.get("url") ?? "").trim();
  const market = (String(formData.get("market") ?? "global") === "cn"
    ? "cn"
    : "global") as Market;

  if (!urlRaw) return { ok: false, error: "URL required." };
  let url: string;
  try {
    url = new URL(/^https?:\/\//i.test(urlRaw) ? urlRaw : `https://${urlRaw}`).toString();
  } catch {
    return { ok: false, error: "Invalid URL." };
  }

  const origin = new URL(url).origin;
  const [htmlRes, robotsRes, llmsRes] = await Promise.all([
    guardedFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    }).catch(() => null),
    fetchText(`${origin}/robots.txt`, 8000),
    fetchText(`${origin}/llms.txt`, 8000),
  ]);
  if (!htmlRes?.ok) {
    return { ok: false, error: "Could not fetch the page (blocked, 404 or timeout)." };
  }
  const html = (await htmlRes.text()).slice(0, 600_000);
  const robotsTxt = robotsRes;
  const llmsTxt = llmsRes;

  // ── 评:确定性双市场审计 ────────────────────────────────────────────
  const brand = new URL(url).hostname.split(".")[0] || undefined;
  const auditCn = auditGeo({ html, market: "cn", robotsTxt, llmsTxt, brandName: brand });
  const auditGlobal = auditGeo({ html, market: "global", robotsTxt, llmsTxt, brandName: brand });

  // ── 方:按所选市场编译改写指令包 ────────────────────────────────────
  const audit = market === "cn" ? auditCn : auditGlobal;
  const instructions = compileRewriteInstructions(
    { items: audit.items, market },
    { engine: "deepseek" },
  );

  const { markdown: pageMarkdown } = parseHtmlToMarkdown(html);
  if (pageMarkdown.trim().length < 200) {
    return {
      ok: false,
      error:
        "Page has too little extractable text — it is likely a CSR shell. Fix rendering before rewriting content.",
    };
  }

  // ── 改:LLM 按指令包重写(事实契约在提示词里,验在下一步) ──────────
  const rewrite = await callAI({
    system: `You are a GEO content rewriter. You receive a page (markdown) and a compiled
instruction package. Apply EVERY content instruction; respect every constraint, including the
anti-AI-flavor clause. Infrastructure items are NOT yours — skip them (the site team handles
robots/llms/schema deployment). Return ONLY the rewritten page in markdown, same language as the
original, same approximate length.`,
    user: `# Instruction package\n\n${instructions.markdown}\n\n# Original page (markdown)\n\n${pageMarkdown.slice(0, 12_000)}\n\nReturn ONLY the rewritten markdown.`,
    maxTokens: 8000,
    temperature: 0.3,
    timeoutMs: 180_000,
    ignoreCreditSaver: true,
  });
  if (!rewrite || rewrite.trim().length < 200) {
    return { ok: false, error: "The model returned an empty/short rewrite. Check the configured AI provider." };
  }

  // ── 验:GEU 护栏(事实地板 + AI 味检测) ─────────────────────────────
  const geu = await geuCheck(pageMarkdown, rewrite);

  const note =
    geu.verdict === "pass"
      ? `Rewrite passed the GEU guard (${geu.total}/100). Audit moved from ${Math.round(audit.total)} (kernel). Review and publish.`
      : `GEU guard REJECTED the rewrite (${geu.total}/100): ${
          [...geu.factConsistency.issues, ...geu.completeness.issues].slice(0, 2).join("; ") ||
          "quality below the pass line"
        }. Keep the original and tighten the instructions.`;

  return {
    ok: true,
    url,
    market,
    audit: {
      cn: { total: auditCn.total, geoScore: auditCn.geoScore, seoScore: auditCn.seoScore },
      global: { total: auditGlobal.total, geoScore: auditGlobal.geoScore, seoScore: auditGlobal.seoScore },
    },
    instructions,
    rewritten: rewrite,
    geu,
    note,
  };
}
