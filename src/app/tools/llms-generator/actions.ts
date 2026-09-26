"use server";

import { guardedFetch } from "@/lib/url-guard";
import { callAI } from "@/lib/ai-call";
import { parseHtmlToMarkdown } from "@/lib/main-content-extractor";
import {
  buildLlmsMessages,
  extractSiteSignals,
  validateLlms,
  type SiteSignals,
} from "@/lib/knowledge/llms-tool";

export type LlmsGeneratorState =
  | {
      ok: true;
      llms: string;
      source: string;
      signals: { title: string; headings: number; links: number };
    }
  | { ok: false; error: string }
  | null;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

export async function runLlmsGenerator(
  _prev: LlmsGeneratorState,
  formData: FormData,
): Promise<LlmsGeneratorState> {
  const url = String(formData.get("url") ?? "").trim();
  const pasted = String(formData.get("content") ?? "").trim();
  const brandName = String(formData.get("brandName") ?? "").trim() || undefined;
  const language = (String(formData.get("language") ?? "auto") as "zh" | "en" | "auto");

  let signals: SiteSignals;
  if (url) {
    let fullUrl = url;
    if (!/^https?:\/\//i.test(fullUrl)) fullUrl = `https://${fullUrl}`;
    let base: URL;
    try {
      base = new URL(fullUrl);
    } catch {
      return { ok: false, error: "无效 URL" };
    }
    let html: string;
    try {
      const res = await guardedFetch(base.toString(), {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });
      if (!res.ok) return { ok: false, error: `抓取页面失败(HTTP ${res.status})` };
      html = (await res.text()).slice(0, 600_000);
    } catch {
      return { ok: false, error: "抓取页面失败(网络或地址错误)" };
    }
    signals = extractSiteSignals(html, base.toString());
    if (signals.contentSample.length < 200) {
      return {
        ok: false,
        error:
          "页面可提取文本过少——疑似 CSR 空壳。llms.txt 需要真实内容做事实底稿,请先粘贴内容或先做预渲染。",
      };
    }
  } else if (pasted.length >= 200) {
    // 粘贴模式:无链接可爬,只用内容
    signals = {
      url: "",
      title: pasted.split("\n")[0].slice(0, 80),
      description: "",
      headings: [],
      links: [],
      contentSample: pasted.slice(0, 6000),
    };
  } else {
    return { ok: false, error: "请填写 URL 或粘贴至少 200 字内容" };
  }

  const { system, user } = buildLlmsMessages(
    signals,
    { brandName, language },
  );
  const raw = await callAI({
    system,
    user,
    maxTokens: 3000,
    temperature: 0.3,
    timeoutMs: 120_000,
    ignoreCreditSaver: true,
  });
  if (!raw) return { ok: false, error: "AI 调用失败——请检查已配置的模型 key" };

  const validated = validateLlms(raw);
  if (!validated.ok) {
    return { ok: false, error: `AI 输出不合规: ${validated.reason}。请重试。` };
  }

  return {
    ok: true,
    llms: validated.llms,
    source: url || "粘贴内容",
    signals: {
      title: signals.title,
      headings: signals.headings.length,
      links: signals.links.length,
    },
  };
}
