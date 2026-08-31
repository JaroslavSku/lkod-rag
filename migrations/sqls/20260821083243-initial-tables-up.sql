/* Replace with your SQL commands */
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH DICTIONARY czech_simple (
    TEMPLATE = pg_catalog.simple,
    StopWords = czech
);

CREATE TEXT SEARCH CONFIGURATION czech (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION czech
  ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, word, hword, hword_part
  WITH unaccent, czech_simple;


CREATE TABLE lkod_search_vectors (
    id integer generated always as identity primary key,
    title text,
    filename text,
    content text,
    fts tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('czech', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('czech', coalesce(content, '')), 'B')
    ) STORED, 
    created_at timestamptz not null default now(),
    updated_at timestamptz null
);