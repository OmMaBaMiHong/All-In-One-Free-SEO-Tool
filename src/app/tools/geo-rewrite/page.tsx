export const dynamic = "force-dynamic";

import { GeoRewriteClient } from "./client";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export default function GeoRewritePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="GEO rewrite workbench"
        description="One click runs the full loop: deterministic cn/global audit → compiled rewrite instructions → LLM rewrite → GEU quality guard. Rewrites that fail the guard are rejected with reasons — the original is never touched."
        icon={Sparkles}
        accent="violet"
      />
      <GeoRewriteClient />
    </div>
  );
}
