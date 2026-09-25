"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { runFaqGenerator, type FaqGeneratorState } from "./actions";

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

export function FaqGeneratorClient() {
  const [state, formAction, pending] = useActionState<FaqGeneratorState, FormData>(
    runFaqGenerator,
    null,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="glass-apple space-y-3 rounded-2xl p-5">
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">页面 URL(可选,留空则用下方粘贴内容)</span>
          <input name="url" placeholder="https://skoob.cc/site" className={inputCls} />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">或直接粘贴内容</span>
          <textarea name="content" rows={6} placeholder="粘贴产品文档/文章正文…" className={inputCls} />
        </label>
        <div className="flex items-end gap-3">
          <label className="w-40 space-y-1 text-xs">
            <span className="text-muted-foreground">生成数量</span>
            <input
              name="count"
              type="number"
              min={3}
              max={10}
              defaultValue={6}
              className={inputCls}
            />
          </label>
          <button type="submit" disabled={pending} className={btnCls}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            生成 FAQ
          </button>
        </div>
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
                FAQ 问答对({state.faqs.length} 组)
                {state.dropped > 0 && (
                  <span className="ml-2 text-[10px] text-amber-300">已剔除 {state.dropped} 条低质量</span>
                )}
              </h2>
              <CopyBtn text={state.htmlSnippet} label="复制 HTML 区块" />
            </div>
            <ol className="space-y-3">
              {state.faqs.map((f, i) => (
                <li key={i} className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/5">
                  <p className="font-medium">Q{i + 1}. {f.question}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.answer}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="glass-apple space-y-3 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                FAQPage JSON-LD(贴进页面 head)
              </h2>
              <CopyBtn text={state.jsonLd} label="复制 JSON-LD" />
            </div>
            <pre className="max-h-72 overflow-auto rounded-xl bg-black/40 p-4 text-[11px] leading-relaxed">
              {state.jsonLd}
            </pre>
            <p className="text-xs text-muted-foreground">
              提示:FAQPage 实测可带来约 2.7x 的 AI 引用率(cn 审计最大缺口项)。
              把这段 JSON-LD 和上面的 HTML 问答区块一起加进目标页面。
            </p>
          </section>
        </>
      )}
    </div>
  );
}
