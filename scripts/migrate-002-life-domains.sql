-- Migration 002: Replace work/personal/unclassified context with personal life domains
-- New domains: personal, family, health, finance, social, creative, travel, unclassified

-- Drop the old CHECK constraint
ALTER TABLE thoughts DROP CONSTRAINT IF EXISTS thoughts_context_check;

-- Add the new CHECK constraint with life domains
ALTER TABLE thoughts ADD CONSTRAINT thoughts_context_check
  CHECK (context IN ('personal', 'family', 'health', 'finance', 'social', 'creative', 'travel', 'unclassified'));

-- Migrate existing 'work' context to 'personal' (since work is handled by Agent Cortex)
UPDATE thoughts SET context = 'personal' WHERE context = 'work';
