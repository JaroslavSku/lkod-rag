
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE lkod_search_vectors ADD COLUMN embedding vector(1024);

CREATE INDEX ON lkod_search_vectors
       USING hnsw (embedding vector_cosine_ops);

