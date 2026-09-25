"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import {
  ingestKnowledgeAction,
  deleteKnowledgeBaseAction,
  generateArticleAction,
} from "./actions";

const inputCls =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-violet-500/50";
const btnCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50";

export function KnowledgeManager({ kbs }: { kbs: { id: number; name: string; chunkCount: number }[] }) {
  const [ingestState, ingestAction, ingestPending] = useActionState(
    ingestKnowledgeAction,
    null,
  );
  const [delState, delAction, delPending] = useActionState(
    deleteKnowledgeBaseAction,
    null,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={ingestAction} className="space-y-2 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/5">
        <p className="text-sm font-medium">入库新知识</p>
        <input name="kbName" placeholder="知识库名称(已有则追加切片)" className={inputCls} />
        <input name="description" placeholder="描述(可选)" className={inputCls} />
        <textarea
          name="markdown"
          rows={5}
          placeholder="粘贴文档/资料(markdown 或纯文本,自动按标题和段落切片)"
          className={inputCls}
        />
        <button type="submit" disabled={ingestPending} className={btnCls}>
          {ingestPending && <Loader2 className="h-4 w-4 animate-spin" />} 切片入库
        </button>
        {ingestState && (
          <p className={`text-xs ${ingestState.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {ingestState.message}
          </p>
        )}
      </form>

      <form action={delAction} className="space-y-2 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/5">
        <p className="text-sm font-medium">删除知识库</p>
        <select name="kbId" className={inputCls}>
          {kbs.map((kb) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}({kb.chunkCount} 切片)
            </option>
          ))}
        </select>
        <button type="submit" disabled={delPending} className="inline-flex h-10 items-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 text-sm text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
          {delPending && <Loader2 className="h-4 w-4 animate-spin" />} 删除(不可恢复)
        </button>
        {delState && (
          <p className={`text-xs ${delState.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {delState.message}
          </p>
        )}
      </form>
    </div>
  );
}

export function GenerationPanel({
  titleLibraries,
}: {
  titleLibraries: { id: number; name: string; available: number }[];
}) {
  const [state, action, pending] = useActionState(generateArticleAction, null);

  return (
    <form action={action} className="space-y-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 space-y-1 text-xs">
          <span className="text-muted-foreground">标题库(取第一个未用标题)</span>
          <select name="libraryId" className={inputCls}>
            {titleLibraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name}(可用 {lib.available})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={btnCls}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "召回→生成中(约 1-2 分钟)" : "生成一篇 → 入草稿池"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        流程:取未用标题 → 统一知识库召回证据 → DeepSeek 按 GEO 硬规则生成 → 入草稿池待质检/发布
      </p>
      {state && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            state.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
          }`}
        >
          {state.message}
          {state.article && ` ·《${state.article.title}》约 ${state.article.words} 字 · 召回 ${state.article.recalled} 条证据`}
        </div>
      )}
    </form>
  );
}
