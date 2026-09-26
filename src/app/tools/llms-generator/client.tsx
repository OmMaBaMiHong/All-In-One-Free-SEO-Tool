"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { runLlmsGenerator, type LlmsGeneratorState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-violet-500/50";
const btnCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50";

function CopyBtn({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(text)}
      className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-500/20"
    >
      {label}
    </button>
  );
}

export function LlmsGeneratorClient() {
  const [state, formAction, pending] = useActionState<LlmsGeneratorState, FormData>(
    runLlmsGenerator,
    null,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="glass-apple space-y-3 rounded-2xl p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_140px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">站点 URL(推荐,自动抓取全站信号)</span>
            <input name="url" placeholder="https://example.com" className={inputCls} />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">品牌名(可选)</span>
            <input name="brandName" placeholder="例如:焚诀 Skoob" className={inputCls} />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">语言</span>
            <select name="language" defaultValue="auto" className={inputCls}>
              <option value="auto">自动检测</option>
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">或粘贴内容(不填 URL 时使用,至少 200 字)</span>
          <textarea name="content" rows={4} placeholder="粘贴产品文档/介绍正文…" className={inputCls} />
        </label>
        <button type="submit" disabled={pending} className={btnCls}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          生成 llms.txt
        </button>
      </form>

      {state && !state.ok && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-4 text-sm text-rose-300">
          {state.error}
        </div>
      )}

      {state && state.ok && (
        <>
          <section className="glass-apple space-y-3 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                生成成功({state.signals.headings} 个标题 · {state.signals.links} 个站内链接)
              </h2>
              <div className="flex gap-2">
                <CopyBtn text={state.llms} label="复制 llms.txt" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              部署:把内容保存为 <b>llms.txt</b> 放到域名根目录(与 robots.txt 同级),nginx 需声明
              charset utf-8 防止中文乱码。
            </p>
            <pre className="max-h-96 overflow-auto rounded-xl bg-black/40 p-4 text-[11px] leading-relaxed">
              {state.llms}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}
