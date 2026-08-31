
DROP INDEX IF EXISTS lkod_search_vectors_embedding_idx;
ALTER TABLE lkod_search_vectors DROP COLUMN IF EXISTS embedding;