"use client";

import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { runGeoRewrite, type GeoRewriteState } from "./actions";

export function GeoRewriteClient() {
  const [state, formAction, pending] = useActionState<GeoRewriteState, FormData>(
    runGeoRewrite,
    null,
  );

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_180px_120px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Page URL</span>
            <input
              name="url"
              placeholder="https://example.com/post"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Market</span>
            <select
              name="market"
              defaultValue="global"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
            >
              <option value="global">全球 (global)</option>
              <option value="cn">中国 (cn)</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 评→方→改→验 运行中(约 1-3 分钟)
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> 一键改写
              </>
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          全流程:确定性审计 → 编译改写指令包 → LLM 重写 → GEU 质量护栏。 rewritten
          未过护栏时会明确告诉你为什么,原文不动。
        </p>
      </form>

      {state && !state.ok && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-4 text-sm text-rose-300">
          {state.error}
        </div>
      )}

      {state && state.ok && (
        <>
          <section className="glass-apple rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                结果
              </h2>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                  state.geu.verdict === "pass"
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                }`}
              >
                GEU {state.geu.total}/100 · {state.geu.verdict === "pass" ? "放行" : "已拒绝"}
              </span>
            </div>
            <p className="text-sm">{state.note}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["cn", "中国市场 (cn)"],
                  ["global", "全球市场 (global)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="mt-1 text-2xl font-semibold">{state.audit[key].total}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    GEO {Math.round(state.audit[key].geoScore)} · SEO {Math.round(state.audit[key].seoScore)}
                  </div>
                </div>
              ))}
            </div>
            {state.geu.factConsistency.issues.length > 0 && (
              <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {state.geu.factConsistency.issues.slice(0, 4).map((i) => (
                  <p key={i}>⚠ {i}</p>
                ))}
              </div>
            )}
          </section>

          <section className="glass-apple rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                改写稿({state.market} 指令包 · {state.instructions.instructions.length} 项整改)
              </h2>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(state.rewritten)}
                className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20"
              >
                复制改写稿
              </button>
            </div>
            <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-xs leading-relaxed">
              {state.rewritten}
            </pre>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-violet-300 hover:underline">
                查看本次使用的指令包
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-[11px] text-muted-foreground">
                {state.instructions.markdown}
              </pre>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
