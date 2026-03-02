CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS thoughts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_text TEXT NOT NULL,
  embedding vector(1536),
  context VARCHAR(20) NOT NULL DEFAULT 'unclassified'
    CHECK (context IN ('work', 'personal', 'unclassified')),
  people TEXT[] DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  thought_type VARCHAR(50),
  action_items JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
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

-- GIN indexes for array overlap queries
CREATE INDEX IF NOT EXISTS thoughts_people_idx ON thoughts USING gin (people);
CREATE INDEX IF NOT EXISTS thoughts_topics_idx ON thoughts USING gin (topics);

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
