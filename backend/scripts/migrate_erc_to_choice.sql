-- Rename erc_* tables to choice_* for data layer unification
-- Run this BEFORE starting the app with the new code

BEGIN;

ALTER TABLE IF EXISTS erc_user_settings RENAME TO choice_user_settings;
ALTER TABLE IF EXISTS erc_user_article_attempts RENAME TO choice_user_article_attempts;
ALTER TABLE IF EXISTS erc_review_logs RENAME TO choice_review_logs;
ALTER TABLE IF EXISTS erc_mistake_bucket RENAME TO choice_mistake_bucket;
ALTER TABLE IF EXISTS erc_user_question_cards RENAME TO choice_user_question_cards;
ALTER TABLE IF EXISTS erc_article_words RENAME TO choice_article_words;
ALTER TABLE IF EXISTS erc_paragraphs RENAME TO choice_paragraphs;
ALTER TABLE IF EXISTS erc_questions RENAME TO choice_questions;
ALTER TABLE IF EXISTS erc_articles RENAME TO choice_articles;
ALTER TABLE IF EXISTS erc_sets RENAME TO choice_sets;

-- Rename indexes
ALTER INDEX IF EXISTS idx_erc_articles_set_sort RENAME TO idx_choice_articles_set_sort;
ALTER INDEX IF EXISTS idx_erc_cards_due RENAME TO idx_choice_cards_due;
ALTER INDEX IF EXISTS idx_erc_logs_user_created RENAME TO idx_choice_logs_user_created;

COMMIT;
