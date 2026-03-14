-- Migration 001: Add full-text search vector for hybrid search (RRF)

-- Add generated tsvector column combining raw_text (weight A) and topics (weight B)
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(raw_text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(topics, ' '), '')), 'B')
  ) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS thoughts_search_vector_idx
  ON thoughts USING gin (search_vector);
