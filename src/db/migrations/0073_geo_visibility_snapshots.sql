-- Daily visibility snapshots: one row per "Check all" run for a client.
-- Charts and deltas read from here; ai_visibility_checks stays the raw
-- evidence (every prompt/response), this table is the derived time series.
CREATE TABLE `geo_visibility_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`client_id` integer NOT NULL REFERENCES `clients` (`id`) ON DELETE CASCADE,
	`captured_at` integer NOT NULL DEFAULT (unixepoch()),
	`checks` integer NOT NULL DEFAULT 0,
	`mentions` integer NOT NULL DEFAULT 0,
	`failed` integer NOT NULL DEFAULT 0,
	`mention_rate` real,
	`mention_low` real,
	`mention_high` real,
	`citation_share` real,
	`mrr` real,
	`avg_rank` real,
	`branded_checks` integer NOT NULL DEFAULT 0,
	`branded_mentions` integer NOT NULL DEFAULT 0,
	`non_branded_checks` integer NOT NULL DEFAULT 0,
	`non_branded_mentions` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `geo_visibility_snapshots_client_time_idx` ON `geo_visibility_snapshots` (`client_id`, `captured_at` DESC);
