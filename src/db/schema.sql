CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS thoughts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_text TEXT NOT NULL,
  embedding vector(1536),
  context VARCHAR(20) NOT NULL DEFAULT 'unclassified'
    CHECK (context IN ('personal', 'family', 'health', 'finance', 'social', 'creative', 'travel', 'unclassified')),
  people TEXT[] DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  thought_type VARCHAR(50),
  action_items JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  confidence INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  archived_reason TEXT,
  idempotency_key VARCHAR(64),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(raw_text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(topics, ' '), '')), 'B')
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS thoughts_embedding_hnsw
  ON thoughts USING hnsw (embedding vector_cosine_ops);

-- B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS thoughts_context_idx ON thoughts (context);
CREATE INDEX IF NOT EXISTS thoughts_created_at_idx ON thoughts (created_at DESC);
CREATE INDEX IF NOT EXISTS thoughts_type_idx ON thoughts (thought_type);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS thoughts_search_vector_idx
  ON thoughts USING gin (search_vector);

-- Indexes for confidence and active status
CREATE INDEX IF NOT EXISTS thoughts_active_idx ON thoughts (active);
CREATE INDEX IF NOT EXISTS thoughts_confidence_idx ON thoughts (confidence DESC);

-- Unique index for idempotency keys (sparse - only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS thoughts_idempotency_key_idx
  ON thoughts (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- GIN indexes for array overlap queries
CREATE INDEX IF NOT EXISTS thoughts_people_idx ON thoughts USING gin (people);
CREATE INDEX IF NOT EXISTS thoughts_topics_idx ON thoughts USING gin (topics);

-- Thought links table for connecting related thoughts
CREATE TABLE IF NOT EXISTS thought_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  relationship VARCHAR(50) NOT NULL
    CHECK (relationship IN (
      'relates_to', 'extends', 'contradicts', 'supports',
      'follows_up', 'inspired_by', 'blocks'
    )),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_link CHECK (source_id != target_id),
  CONSTRAINT unique_link UNIQUE (source_id, target_id, relationship)
);

CREATE INDEX IF NOT EXISTS thought_links_source_idx ON thought_links (source_id);
CREATE INDEX IF NOT EXISTS thought_links_target_idx ON thought_links (target_id);
CREATE INDEX IF NOT EXISTS thought_links_relationship_idx ON thought_links (relationship);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON thoughts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON thoughts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
