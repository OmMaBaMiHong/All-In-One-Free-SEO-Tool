export const dynamic = "force-dynamic";

import { FaqGeneratorClient } from "./client";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export default function FaqGeneratorPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="FAQPage 生成器"
        description="从任意页面或粘贴内容生成 FAQ 问答对 + 可直接部署的 FAQPage JSON-LD。FAQ 结构实测带来约 2.7x 的 AI 引用率——这是 cn 审计中最大缺口项的一键修复工具。"
        icon={Sparkles}
        accent="violet"
      />
      <FaqGeneratorClient />
    </div>
  );
}
