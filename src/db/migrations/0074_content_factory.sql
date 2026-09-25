-- Content factory (native TS rewrite of the GEOFlow sidecar's useful core).
-- Data migrated from the GEOFlow PostgreSQL via geoflow-migration/*.json.
-- V1 scope: knowledge bases + chunks, title/keyword libraries, prompts,
-- articles, authors. V2 (planned): vectors, multi-site distribution.

CREATE TABLE `cf_knowledge_bases` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`description` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `cf_knowledge_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`kb_id` integer NOT NULL REFERENCES `cf_knowledge_bases` (`id`) ON DELETE CASCADE,
	`chunk_index` integer NOT NULL DEFAULT 0,
	`content` text NOT NULL,
	`imported_from` text NOT NULL DEFAULT 'geoflow'
);
--> statement-breakpoint
CREATE TABLE `cf_title_libraries` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cf_titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`library_id` integer NOT NULL REFERENCES `cf_title_libraries` (`id`) ON DELETE CASCADE,
	`title` text NOT NULL,
	`used` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `cf_keyword_libraries` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cf_lib_keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`library_id` integer NOT NULL REFERENCES `cf_keyword_libraries` (`id`) ON DELETE CASCADE,
	`keyword` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cf_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`kind` text NOT NULL DEFAULT 'body',
	`content` text NOT NULL,
	`variables` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `cf_articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`title` text NOT NULL,
	`content_md` text NOT NULL,
	`status` text NOT NULL DEFAULT 'draft',
	`source` text NOT NULL DEFAULT 'geoflow',
	`ai_score` real,
	`created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `cf_authors` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL
);
