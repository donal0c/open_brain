-- Migration 003: Add confidence/reinforcement and deprecation/archival

-- Confidence: tracks how important/recurring a thought is
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS confidence INT NOT NULL DEFAULT 1;

-- Archival: soft-delete without losing the record
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- Index for filtering active thoughts
CREATE INDEX IF NOT EXISTS thoughts_active_idx ON thoughts (active);
CREATE INDEX IF NOT EXISTS thoughts_confidence_idx ON thoughts (confidence DESC);
