export const dynamic = "force-dynamic";

import { LlmsGeneratorClient } from "./client";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export default function LlmsGeneratorPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="llms.txt 生成器"
        description="按 llmstxt.org 规范为任意站点生成 llms.txt(H1 + 摘要 + 我们是谁/有什么/怎么用与价格/不做什么 + 主要页面链接)。AI 引擎按需读取此文件了解站点;cn 评分体系中的发现文件项。部署:放到域名根目录,与 robots.txt 同级。"
        icon={Sparkles}
        accent="violet"
      />
      <LlmsGeneratorClient />
    </div>
  );
}
