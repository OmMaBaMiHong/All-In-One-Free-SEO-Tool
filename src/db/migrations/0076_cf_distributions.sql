-- 分发记录:一篇文章 × 一个渠道的一次改编/发布。
-- published_url 是外链回执,发布成功时同步登记进 backlinks 表(SEO 侧)。
CREATE TABLE `cf_distributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`article_id` integer NOT NULL REFERENCES `cf_articles` (`id`) ON DELETE CASCADE,
	`channel_id` integer NOT NULL REFERENCES `cf_channels` (`id`) ON DELETE CASCADE,
	`status` text NOT NULL DEFAULT 'adapted',
	`adapted_md` text NOT NULL DEFAULT '',
	`published_url` text,
	`adapted_at` integer NOT NULL DEFAULT (unixepoch()),
	`published_at` integer
);
--> statement-breakpoint
CREATE INDEX `cf_distributions_article_idx` ON `cf_distributions` (`article_id`);
