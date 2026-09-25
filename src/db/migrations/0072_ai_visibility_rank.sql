-- MRR semantic-rank judge results (see src/lib/geo-metrics/rank.ts).
-- One judgment per check that mentioned the brand: the judge LLM returns
-- the semantic endorsement position + literal evidence spans; the
-- deterministic ordinal scan is stored alongside for drift auditing.
ALTER TABLE `ai_visibility_checks` ADD `rank` integer;
ALTER TABLE `ai_visibility_checks` ADD `rank_evidence` text;
ALTER TABLE `ai_visibility_checks` ADD `answer_intent` text;
ALTER TABLE `ai_visibility_checks` ADD `rank_source` text;
ALTER TABLE `ai_visibility_checks` ADD `deterministic_rank` integer;
