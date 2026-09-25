-- 渠道分发库(V2):内容铺量的目标平台档案。
-- 设计来源:docs/research/ 2026-09-25 四份调研(外链分类学/中文及新加坡渠道/
-- AI 引用源/基座分发盘点)。双轨打标:seo_value(排名权重)× geo_value
-- (AI 实体信号),另含难度/风险/行业/风格模板——渠道即格式模板,
-- 分发时 style 注入生成提示词(沿用 guest-post-sites 的现成思想)。
CREATE TABLE `cf_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`platform_type` text NOT NULL DEFAULT 'blog',
	`region` text NOT NULL DEFAULT 'global',
	`domain` text NOT NULL DEFAULT '',
	`link_form` text NOT NULL DEFAULT 'none',
	`seo_value` integer NOT NULL DEFAULT 3,
	`geo_value` integer NOT NULL DEFAULT 3,
	`difficulty` text NOT NULL DEFAULT 'medium',
	`risk` text NOT NULL DEFAULT 'medium',
	`niches` text NOT NULL DEFAULT '[]',
	`style` text NOT NULL DEFAULT '{}',
	`submit_url` text NOT NULL DEFAULT '',
	`notes` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `cf_channels_region_idx` ON `cf_channels` (`region`);
