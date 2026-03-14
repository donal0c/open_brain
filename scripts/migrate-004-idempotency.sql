-- Migration 004: Add idempotency key support for offline-first clients

ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);

-- Unique index for fast lookups (nullable - most thoughts won't have one)
CREATE UNIQUE INDEX IF NOT EXISTS thoughts_idempotency_key_idx
  ON thoughts (idempotency_key) WHERE idempotency_key IS NOT NULL;
