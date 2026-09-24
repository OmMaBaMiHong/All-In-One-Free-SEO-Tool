-- Brand alias terms for AI-visibility branded/non-branded query
-- classification (see src/lib/geo-metrics/brand-tags.ts). JSON array of
-- strings, e.g. ["焚诀", "天衍", "OpenSkoob"] — terms a mention could use
-- that are NOT derivable from the client name or domain.
ALTER TABLE `clients` ADD `brand_aliases` text;
