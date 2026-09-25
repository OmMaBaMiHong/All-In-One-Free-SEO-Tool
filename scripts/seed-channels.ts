/**
 * Channel library seed — from two sources, both documented in
 * docs/research/ (2026-09-25):
 *  1) The base app's own guest-post-sites.ts (17 international platforms,
 *     with per-channel style profiles) — idempotent by name.
 *  2) Chinese + Singapore platforms from the distribution research
 *     (知乎/公众号/CSDN/百家号/头条号/百度百科/搜狐号/简书/豆瓣/Reddit
 *     SG/Medium/GBP), labeled per the dual-track taxonomy
 *     (seo_value × geo_value × difficulty × risk).
 *
 * Idempotent: channels are upserted by name.
 *
 * Usage: npx tsx scripts/seed-channels.ts
 */
import Database from "better-sqlite3";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const db = new Database(
  join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "data.db"),
  { timeout: 10_000 },
);

interface ChannelRow {
  name: string;
  platform_type: string;
  region: string;
  domain: string;
  link_form: string;
  seo_value: number;
  geo_value: number;
  difficulty: string;
  risk: string;
  niches: string;
  style: string;
  submit_url: string;
  notes: string;
}

// ── 1) 中文 + 新加坡渠道(调研报告 ② 节平台档案)────────────────────
const CN_SG: ChannelRow[] = [
  {
    name: "知乎", platform_type: "community", region: "cn", domain: "zhihu.com",
    link_form: "nofollow", seo_value: 5, geo_value: 5, difficulty: "medium", risk: "medium",
    niches: JSON.stringify(["小说创作", "AI 工具", "通用"]),
    style: JSON.stringify({ tone: "专业长文/亲测体验", wordCount: { min: 1500, ideal: 3000, max: 8000 }, mustDo: ["个人经历切入", "结构化小节", "数据支撑"], mustAvoid: ["硬广导流", "纯营销文"] }),
    submit_url: "https://zhuanlan.zhihu.com/write",
    notes: "百度权重高 + Kimi 等国产 AI 第一引用社区。导流管控严:养号、软性提及。",
  },
  {
    name: "微信公众号", platform_type: "social", region: "cn", domain: "mp.weixin.qq.com",
    link_form: "none", seo_value: 2, geo_value: 5, difficulty: "medium", risk: "low",
    niches: JSON.stringify(["通用"]),
    style: JSON.stringify({ tone: "公众号体", wordCount: { min: 1200, ideal: 2500, max: 5000 }, mustDo: ["对话感", "小标题节奏"], mustAvoid: ["外链堆砌"] }),
    submit_url: "https://mp.weixin.qq.com/",
    notes: "百度搜不到,但腾讯元宝独家信源、Kimi 可检索。GEO 价值看 AI 通道不看 SEO。",
  },
  {
    name: "CSDN", platform_type: "dev", region: "cn", domain: "csdn.net",
    link_form: "nofollow", seo_value: 4, geo_value: 4, difficulty: "low", risk: "low",
    niches: JSON.stringify(["AI 工具", "开发者", "开源"]),
    style: JSON.stringify({ tone: "技术教程", wordCount: { min: 1000, ideal: 2000, max: 6000 }, mustDo: ["代码/CLI 示例", "步骤化"], mustAvoid: ["纯营销"] }),
    submit_url: "https://mp.csdn.net/mp_blog/creation/editor",
    notes: "有开源仓库的 AI 工具天然主场;DeepSeek 技术类首选信源之一;百度收录快。",
  },
  {
    name: "百家号", platform_type: "blog", region: "cn", domain: "baijiahao.baidu.com",
    link_form: "none", seo_value: 5, geo_value: 4, difficulty: "medium", risk: "medium",
    niches: JSON.stringify(["通用"]),
    style: JSON.stringify({ tone: "资讯/科普", wordCount: { min: 800, ideal: 1500, max: 4000 }, mustDo: ["标题信息量", "正文不可留外链"], mustAvoid: ["硬广", "导流"] }),
    submit_url: "https://baijiahao.baidu.com/",
    notes: "百度自家生态:收录最快、搜索加权最狠;文心一言核心信源。正文不可加外链。",
  },
  {
    name: "头条号", platform_type: "social", region: "cn", domain: "toutiao.com",
    link_form: "none", seo_value: 1, geo_value: 5, difficulty: "medium", risk: "low",
    niches: JSON.stringify(["通用"]),
    style: JSON.stringify({ tone: "大众科普/故事化", wordCount: { min: 800, ideal: 1800, max: 4000 }, mustDo: ["口语化"], mustAvoid: ["百度 SEO 思维(字节 robots 屏蔽百度)"] }),
    submit_url: "https://mp.toutiao.com/",
    notes: "豆包第一信源(字节系实测偏好)。注意:百度基本不收录字节内容——SEO 与 GEO 在此分裂。",
  },
  {
    name: "搜狐号", platform_type: "blog", region: "cn", domain: "sohu.com",
    link_form: "plain-text", seo_value: 4, geo_value: 3, difficulty: "low", risk: "low",
    niches: JSON.stringify(["通用"]),
    style: JSON.stringify({ tone: "媒体稿", wordCount: { min: 800, ideal: 1500, max: 4000 }, mustDo: ["新闻价值"], mustAvoid: ["敏感表述"] }),
    submit_url: "https://mp.sohu.com/",
    notes: "2025-2026 少数还能留纯文本链接 + 百度收录快的免费渠道。",
  },
  {
    name: "简书", platform_type: "community", region: "cn", domain: "jianshu.com",
    link_form: "plain-text", seo_value: 3, geo_value: 3, difficulty: "low", risk: "medium",
    niches: JSON.stringify(["小说创作", "写作人群"]),
    style: JSON.stringify({ tone: "作者随笔/教程", wordCount: { min: 800, ideal: 2000, max: 5000 }, mustDo: ["创作人群共鸣"], mustAvoid: ["硬广"] }),
    submit_url: "https://www.jianshu.com/writer",
    notes: "小说/写作人群精准聚集地,审核严,软性打法。",
  },
  {
    name: "Reddit r/singapore", platform_type: "community", region: "sg", domain: "reddit.com",
    link_form: "ugc", seo_value: 2, geo_value: 5, difficulty: "medium", risk: "medium",
    niches: JSON.stringify(["新加坡人群", "AI 工具"]),
    style: JSON.stringify({ tone: "口语化讨论", wordCount: { min: 100, ideal: 300, max: 1000 }, mustDo: ["先参与社区再提及", "透明披露身份"], mustAvoid: ["裸广告(必删)"] }),
    submit_url: "https://www.reddit.com/r/singapore/",
    notes: "新加坡 Google 占 90%+;Reddit 是各 AI 引用大户(与 Google 有数据协议)。",
  },
  {
    name: "Medium", platform_type: "blog", region: "global", domain: "medium.com",
    link_form: "nofollow", seo_value: 3, geo_value: 4, difficulty: "low", risk: "low",
    niches: JSON.stringify(["AI 工具", "写作", "通用"]),
    style: JSON.stringify({ tone: "个人叙事+深度", wordCount: { min: 1200, ideal: 2500, max: 6000 }, mustDo: ["个人经验", "小标题"], mustAvoid: ["listicle 水文"] }),
    submit_url: "https://medium.com/new-story",
    notes: "英文出海主力开放平台之一,配合英文关键词预埋。",
  },
  {
    name: "Google Business Profile", platform_type: "local", region: "sg", domain: "google.com/business",
    link_form: "dofollow", seo_value: 4, geo_value: 3, difficulty: "low", risk: "low",
    niches: JSON.stringify(["企业实体"]),
    style: JSON.stringify({ tone: "官方公告", wordCount: { min: 100, ideal: 300, max: 1500 }, mustDo: ["更新动态"], mustAvoid: [] }),
    submit_url: "https://business.google.com/",
    notes: "新加坡市场 Google 生态基础位。",
  },
];

// ── 2) 基座自带的 17 个国际客座平台(读取 TS 数据源)────────────────
async function loadGuestPostSites(): Promise<ChannelRow[]> {
  const mod = await import("../src/lib/guest-post-sites");
  const sites = mod.GUEST_POST_SITES;
  return sites.map((s) => ({
    name: s.name,
    platform_type: "blog",
    region: "global",
    domain: s.domain,
    link_form: s.dofollowPolicy,
    seo_value: s.estDA >= 80 ? 5 : s.estDA >= 60 ? 4 : s.estDA >= 40 ? 3 : 2,
    geo_value: 3,
    difficulty:
      s.difficulty === "easy" ? "low" : s.difficulty === "hard" ? "high" : "medium",
    risk: "low",
    niches: JSON.stringify(s.niches),
    style: JSON.stringify(s.style),
    submit_url: s.submitUrl,
    notes: `基座内置客座平台(DA~${s.estDA})`,
  }));
}

const importAll = db.transaction((rows: ChannelRow[]) => {
  const upsert = db.prepare(`
    INSERT INTO cf_channels (name, platform_type, region, domain, link_form,
      seo_value, geo_value, difficulty, risk, niches, style, submit_url, notes)
    VALUES (@name, @platform_type, @region, @domain, @link_form,
      @seo_value, @geo_value, @difficulty, @risk, @niches, @style, @submit_url, @notes)
    ON CONFLICT(name) DO UPDATE SET
      platform_type=excluded.platform_type, region=excluded.region,
      domain=excluded.domain, seo_value=excluded.seo_value, geo_value=excluded.geo_value,
      niches=excluded.niches, style=excluded.style, notes=excluded.notes
  `);
  for (const r of rows) upsert.run(r);
});

async function main() {
  // name 上需要唯一约束才能 upsert;0075 没有,补一条(幂等)
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS cf_channels_name_idx ON cf_channels (name)",
  );
  const cnSg = CN_SG;
  const guest = await loadGuestPostSites();
  importAll(cnSg);
  importAll(guest);
  const n = (
    db.prepare("SELECT COUNT(*) AS n FROM cf_channels").get() as { n: number }
  ).n;
  console.log(`渠道库就绪:共 ${n} 个渠道(cn/sg ${cnSg.length} + 国际 ${guest.length})`);
  db.close();
}

void main();
