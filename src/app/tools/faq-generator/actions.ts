"use server";

import { guardedFetch } from "@/lib/url-guard";
import { callAI } from "@/lib/ai-call";
import { parseHtmlToMarkdown } from "@/lib/main-content-extractor";
import {
  buildFaqHtml,
  buildFaqJsonLd,
  buildFaqMessages,
  parseFaqOutput,
  type FaqPair,
} from "@/lib/knowledge/faq-generator";

export type FaqGeneratorState =
  | {
      ok: true;
      faqs: FaqPair[];
      jsonLd: string;
      htmlSnippet: string;
      dropped: number;
      source: string;
    }
  | { ok: false; error: string }
  | null;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

export async function runFaqGenerator(
  _prev: FaqGeneratorState,
  formData: FormData,
): Promise<FaqGeneratorState> {
  const url = String(formData.get("url") ?? "").trim();
  const pasted = String(formData.get("content") ?? "").trim();
  const count = Math.min(10, Math.max(3, Number(formData.get("count") ?? 6)));

  let markdown = pasted;
  let source = "粘贴内容";
  if (!markdown && url) {
    try {
      const res = await guardedFetch(
        /^https?:\/\//i.test(url) ? url : `https://${url}`,
        {
          headers: { "user-agent": USER_AGENT, accept: "text/html" },
          signal: AbortSignal.timeout(15_000),
          redirect: "follow",
        },
      );
      if (!res.ok) return { ok: false, error: `抓取页面失败(HTTP ${res.status})` };
      markdown = parseHtmlToMarkdown((await res.text()).slice(0, 600_000)).markdown;
      source = url;
    } catch {
      return { ok: false, error: "抓取页面失败(网络或地址错误)" };
    }
  }
  if (markdown.length < 200) {
    return {
      ok: false,
      error:
        "内容不足(至少 200 字符)。粘贴内容或填 URL——注意 CSR 空壳页抽不出正文,先做预渲染。",
    };
  }

  const { system, user } = buildFaqMessages(markdown, {
    count,
    languageHint: /[\u4e00-\u9fff]/.test(markdown.slice(0, 500)) ? "zh" : "auto",
  });
  const raw = await callAI({
    system,
    user,
    maxTokens: 2000,
    temperature: 0.3,
    timeoutMs: 120_000,
    ignoreCreditSaver: true,
  });
  if (!raw) return { ok: false, error: "AI 调用失败——请检查已配置的模型 key" };

  const { faqs, dropped } = parseFaqOutput(raw);
  if (faqs.length === 0) {
    return { ok: false, error: "AI 没有产出合格的问答对,请重试或换内容" };
  }

  return {
    ok: true,
    faqs,
    jsonLd: buildFaqJsonLd(faqs),
    htmlSnippet: buildFaqHtml(faqs),
    dropped,
    source,
  };
}

