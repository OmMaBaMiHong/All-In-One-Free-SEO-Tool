export const dynamic = "force-dynamic";

import { ExternalLink, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { getGeoFlowStatus } from "./actions";

/**
 * 内容工厂 — the C-end entry to the GEOFlow sidecar.
 *
 * AGPL boundary (deliberate): GEOFlow runs as a SEPARATE service and this
 * page only links to it; no code is shared or merged, which keeps our MIT
 * fork clean. From the user's seat this page is the single entry — every
 * deep link opens the exact GEOFlow screen, so the second UI is reached
 * only inside a task, never hunted for.
 *
 * Deep links assume the default admin path (/geo_admin) of the local
 * compose deployment.
 */

const STAGES: {
  stage: string;
  title: string;
  what: string;
  href: string;
  hrefLabel: string;
}[] = [
  {
    stage: "01",
    title: "知识资产",
    what: "把焚诀官方文档、选题资料灌进知识库:切片、向量化、风险与审核状态决定它们能否被安全召回。",
    href: "http://localhost:18081/geo_admin/materials",
    hrefLabel: "打开知识库",
  },
  {
    stage: "02",
    title: "任务化生产",
    what: "选标题库 + 知识库 + 模型,系统批量产出草稿。生产走队列,失败自动退避重试。",
    href: "http://localhost:18081/geo_admin/tasks/create",
    hrefLabel: "新建任务",
  },
  {
    stage: "03",
    title: "AI 质检门禁",
    what: "四维评分:知识一致性 35 · 数据可溯源 25 · 广告合规 30 · 内容完整 10。不过线的稿子卡在草稿区并说明原因。",
    href: "http://localhost:18081/geo_admin/articles",
    hrefLabel: "看质检结果",
  },
  {
    stage: "04",
    title: "内容管理与发布",
    what: "质检通过的稿件按发布节奏上线到 GEOFlow 托管站(自带 schema/sitemap/llms.txt),再经分发管理推到渠道站。",
    href: "http://localhost:18081/geo_admin/articles",
    hrefLabel: "管理内容",
  },
];

export default async function ContentFactoryPage() {
  const status = await getGeoFlowStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="内容工厂"
        description="GEO 内容生产引擎(独立部署的 GEOFlow 实例):知识库 → AI 写稿 → 四维质检门禁 → 人工放行 → 多站分发。测量与归因在本系统,量产在这里。"
        icon={Sparkles}
        accent="violet"
      />

      {/* 连接状态 */}
      <section
        className={`rounded-2xl border p-5 ${
          status.reachable
            ? "border-emerald-500/20 bg-emerald-500/[0.04]"
            : "border-rose-500/30 bg-rose-500/[0.05]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              引擎状态:{" "}
              {status.reachable ? (
                <span className="text-emerald-300">运行中{status.latencyMs != null && ` · ${status.latencyMs}ms`}</span>
              ) : (
                <span className="text-amber-300">已退役(原生重写中)</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              原 GEOFlow 实例 {status.baseUrl} · 153 条数据(知识库/标题/关键词/文章/提示词)已迁入本系统
            </p>
          </div>
          <a
            href={`${status.baseUrl}/geo_admin/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 text-sm text-violet-300 hover:bg-violet-500/20"
          >
            打开完整后台 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {!status.reachable && (
          <p className="mt-2 text-xs text-muted-foreground">
            原容器已按决策停用(数据卷保留)。原生 TS 版知识库/生成/门禁/分发模块在本系统内开发中。
          </p>
        )}
      </section>

      {/* 六环操作地图 */}
      <section className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          生产流水线(点卡片直达对应后台)
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {STAGES.map((s) => (
            <a
              key={s.stage}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-white/5 bg-card/40 p-5 transition hover:border-violet-500/30 hover:bg-violet-500/[0.04]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
                  {s.stage}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-violet-300 opacity-0 transition group-hover:opacity-100">
                  {s.hrefLabel} <ExternalLink className="h-3 w-3" />
                </span>
              </div>
              <p className="mt-2 font-medium">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.what}</p>
            </a>
          ))}
        </div>
      </section>

      {/* 分工说明 */}
      <section className="rounded-2xl border border-white/5 bg-card/40 p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">与本系统的分工</p>
        <p className="mt-2">
          本系统(SEO 工具)负责<b className="text-foreground">测量与诊断</b>:双引擎排名、AI
          可见性、审计评分、关键词机会;内容工厂负责<b className="text-foreground">量产与质检</b>。
          工作流:在这里发现机会(哪个词有机会/哪类内容缺)→ 到内容工厂开任务生产 →
          发布后回到本系统看排名与 AI 引用变化,形成归因闭环。
        </p>
      </section>
    </div>
  );
}
