"use client";

import { useActionState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { Loader2, Sparkles } from "lucide-react";
import { runGeoScore, type GeoScoreState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

export function GeoScoreClient({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  // Prefilled when opened from a client, so the domain is not retyped.
  const presetUrl = usePresetUrl();
  const [state, formAction, pending] = useActionState<GeoScoreState, FormData>(
    runGeoScore,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">URL to score</span>
            <input
              name="url"
              defaultValue={presetUrl}
              required
              placeholder="https://yoursite.com/page"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          {clients.length > 0 && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                Tag to client (optional)
              </span>
              <select
                name="clientId"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
              >
                <option value="">— none —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Scoring 6 dimensions… (30-60s)
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              Run GEO score
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section
            className={`rounded-2xl border p-6 ${
              state.composite >= 75
                ? "border-emerald-500/30 bg-emerald-500/5"
                : state.composite >= 50
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{state.url}</h2>
              <div
                className={`text-4xl font-bold tabular-nums ${
                  state.composite >= 75
                    ? "text-emerald-300"
                    : state.composite >= 50
                      ? "text-amber-300"
                      : "text-rose-300"
                }`}
              >
                {state.composite}
                <span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
            <p className="mt-2 text-sm">{state.summary}</p>
          </section>

          <section className="space-y-2">
            {(
              [
                ["citability", "Citability", "Weight 25%"],
                ["brandAuthority", "Brand authority", "Weight 20%"],
                ["contentEeat", "Content E-E-A-T", "Weight 20%"],
                ["technical", "Technical foundation", "Weight 15%"],
                ["schema", "Schema", "Weight 10%"],
                ["platformTactics", "Platform tactics", "Weight 10%"],
              ] as const
            ).map(([key, label, weightLabel]) => {
              const d = state.dimensions[key];
              return (
                <div
                  key={key}
                  className={`rounded-xl border px-4 py-3 ${
                    d.score >= 75
                      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : d.score >= 50
                        ? "border-amber-500/20 bg-amber-500/[0.04]"
                        : "border-rose-500/20 bg-rose-500/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="font-medium">{label}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {weightLabel}
                      </p>
                    </div>
                    <span
                      className={`text-2xl font-bold tabular-nums ${
                        d.score >= 75
                          ? "text-emerald-300"
                          : d.score >= 50
                            ? "text-amber-300"
                            : "text-rose-300"
                      }`}
                    >
                      {d.score}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full ${
                        d.score >= 75
                          ? "bg-emerald-400/70"
                          : d.score >= 50
                            ? "bg-amber-400/70"
                            : "bg-rose-400/70"
                      }`}
                      style={{ width: `${d.score}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{d.note}</p>
                </div>
              );
            })}
          </section>

          {state.dualMarket && (
            <section className="space-y-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                中国 / 全球双市场评分(确定性 22 项内核)
              </h3>
              {(
                [
                  ["cn", "中国市场 (cn)", "百度/AI 爬虫准入 · llms 宽容"],
                  ["global", "全球市场 (global)", "GPTBot/ClaudeBot/PerplexityBot 准入 · llms 一级信号"],
                ] as const
              ).map(([key, label, hint]) => {
                const m = state.dualMarket![key];
                return (
                  <div
                    key={key}
                    className={`rounded-xl border px-4 py-3 ${
                      m.veto.length > 0
                        ? "border-rose-500/30 bg-rose-500/[0.05]"
                        : m.total >= 70
                          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                          : "border-amber-500/20 bg-amber-500/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{label}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{hint}</p>
                      </div>
                      <span className="text-2xl font-bold tabular-nums">{m.total}</span>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      <span>GEO 引用就绪 <b className="text-foreground">{Math.round(m.geoScore)}</b></span>
                      <span>SEO 排名就绪 <b className="text-foreground">{Math.round(m.seoScore)}</b></span>
                    </div>
                    {m.veto.length > 0 && (
                      <div className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                        {m.veto.map((v) => (
                          <p key={v}>⚠ {v}(总分封顶 60)</p>
                        ))}
                      </div>
                    )}
                    {m.weakest.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.weakest.slice(0, 3).map((w) => (
                          <p key={w.id} className="text-xs text-muted-foreground">
                            · [{w.id}] {w.name} {w.earned}/{w.weight} — {w.note}
                          </p>
                        ))}
                      </div>
                    )}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-violet-300 hover:underline">
                        改写指令包(复制给任意 LLM 执行)
                      </summary>
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(m.rewriteMarkdown);
                          }}
                          className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-500/20"
                        >
                          复制全文
                        </button>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                          {m.rewriteMarkdown}
                        </pre>
                      </div>
                    </details>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      <RecentRuns toolId="geo-score" refreshKey={refreshKey} />
    </div>
  );
}
