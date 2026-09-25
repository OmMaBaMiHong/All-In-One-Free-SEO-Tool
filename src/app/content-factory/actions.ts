"use server";

export interface GeoFlowStatus {
  reachable: boolean;
  baseUrl: string;
  latencyMs?: number;
}

/**
 * GEOFlow sidecar status. Base URL from the GEOFLOW_BASE_URL env
 * (defaults to the local compose port). Server-side only: the call runs
 * from the Node process, which may need different proxy rules than the
 * browser.
 */
export async function getGeoFlowStatus(): Promise<GeoFlowStatus> {
  const baseUrl =
    (process.env.GEOFLOW_BASE_URL ?? "http://localhost:18081").replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  const started = Date.now();
  try {
    // Plain fetch on purpose: guardedFetch blocks private/localhost targets
    // (anti-SSRF for user-submitted URLs). This is an operator-configured
    // sidecar in the trust boundary, not user input.
    const res = await fetch(`${baseUrl}/up`, {
      signal: ctrl.signal,
      redirect: "manual",
    });
    return {
      reachable: res.ok,
      baseUrl,
      latencyMs: Date.now() - started,
    };
  } catch {
    return { reachable: false, baseUrl };
  } finally {
    clearTimeout(t);
  }
}


// ── 统一知识库管理(SEO/GEO 共用)────────────────────────────────────
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { cfKnowledgeBases, cfKnowledgeChunks } from "@/db/schema";
import { ingestKnowledge, recallKnowledge } from "@/lib/knowledge/service";
import { callAI } from "@/lib/ai-call";
import { computeQualityGate } from "@/lib/knowledge/quality-gate";

export async function ingestKnowledgeAction(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const kbName = String(formData.get("kbName") ?? "").trim();
  const markdown = String(formData.get("markdown") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!kbName) return { ok: false, message: "知识库名称必填" };
  if (markdown.length < 100) return { ok: false, message: "内容太短(至少 100 字符)" };
  const { chunks } = await ingestKnowledge({ kbName, description, markdown });
  revalidatePath("/content-factory");
  return { ok: true, message: `已入库「${kbName}」:切出 ${chunks} 个知识切片` };
}

export async function deleteKnowledgeBaseAction(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const id = Number(formData.get("kbId"));
  if (!Number.isFinite(id)) return { ok: false, message: "参数错误" };
  await db.delete(cfKnowledgeChunks).where(eq(cfKnowledgeChunks.kbId, id));
  await db.delete(cfKnowledgeBases).where(eq(cfKnowledgeBases.id, id));
  revalidatePath("/content-factory");
  return { ok: true, message: "知识库已删除" };
}


// ── 内容生成(标题库 → 召回 → LLM → 草稿)──────────────────────────
import {
  cfArticles,
  cfTitles,
} from "@/db/schema";
import {
  buildGenerationMessages,
  pickUnusedTitles,
} from "@/lib/knowledge/generation";
import { asc } from "drizzle-orm";

export async function generateArticleAction(
  _prev: {
    ok: boolean;
    message: string;
    article?: { id: number; title: string; words: number; recalled: number };
  } | null,
  formData: FormData,
): Promise<{
  ok: boolean;
  message: string;
  article?: { id: number; title: string; words: number; recalled: number };
}> {
  const libraryId = Number(formData.get("libraryId"));
  if (!Number.isFinite(libraryId)) return { ok: false, message: "请选择标题库" };

  const titles = await db
    .select()
    .from(cfTitles)
    .where(eq(cfTitles.libraryId, libraryId))
    .orderBy(asc(cfTitles.id));
  const [next] = pickUnusedTitles(titles, 1);
  if (!next) return { ok: false, message: "标题库已用完(可开启循环或补充标题)" };

  const recalled = await recallKnowledge(next.title, 5).catch(() => []);
  const { system, user } = buildGenerationMessages({
    title: next.title,
    knowledge: recalled.map((r) => r.content),
  });

  const raw = await callAI({
    system,
    user,
    maxTokens: 6000,
    temperature: 0.4,
    timeoutMs: 240_000,
    ignoreCreditSaver: true,
  });
  if (!raw || raw.trim().length < 300) {
    return { ok: false, message: "模型返回为空或过短,请检查 AI 配置后重试" };
  }

  // 质检门禁:知识一致性(证据术语覆盖)+ 广告法黑名单 + 结构。不过线 → 拦截。
  const evidenceChunks = recalled.map((r) => r.content);
  const gate = computeQualityGate(raw.trim(), evidenceChunks);
  const status = gate.verdict === "pass" ? "draft" : "rejected";

  const [article] = await db
    .insert(cfArticles)
    .values({
      title: next.title,
      contentMd: raw.trim(),
      status,
      source: "native",
      aiScore: gate.total,
    })
    .returning();
  await db.update(cfTitles).set({ used: 1 }).where(eq(cfTitles.id, next.id));

  revalidatePath("/content-factory");
  const gateLine =
    gate.verdict === "pass"
      ? `质检 ${gate.total}/100 通过`
      : `质检 ${gate.total}/100 已拦截(${[
          ...gate.adCompliance.issues,
          ...gate.evidenceCoverage.issues,
          ...gate.structure.issues,
        ]
          .slice(0, 2)
          .join(";")})`;
  return {
    ok: true,
    message: `${status === "draft" ? "生成完成,已入草稿池" : "生成完成,但被质检拦截"} · ${gateLine}`,
    article: {
      id: article.id,
      title: next.title,
      words: Math.round(raw.trim().length / 2),
      recalled: recalled.length,
    },
  };
}
