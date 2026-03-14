import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExtractionResponse } from '../services/extraction.js';

test('normalizeExtractionResponse parses valid JSON payloads', () => {
  const metadata = normalizeExtractionResponse(JSON.stringify({
    people: ['Donal'],
    topics: ['openclaw', 'memory'],
    thought_type: 'idea',
    action_items: ['Prototype the skill'],
    context: 'creative',
  }));

  assert.deepEqual(metadata, {
    people: ['Donal'],
    topics: ['openclaw', 'memory'],
    thought_type: 'idea',
    action_items: ['Prototype the skill'],
    context: 'creative',
  });
});

test('normalizeExtractionResponse strips markdown fences and respects explicit context', () => {
  const metadata = normalizeExtractionResponse(
    '```json\n{"people":[],"topics":["sleep"],"thought_type":"observation","action_items":[],"context":"health"}\n```',
    'personal'
  );

  assert.equal(metadata.context, 'personal');
  assert.equal(metadata.thought_type, 'observation');
  assert.deepEqual(metadata.topics, ['sleep']);
});

test('normalizeExtractionResponse falls back safely on invalid JSON', () => {
  const metadata = normalizeExtractionResponse('not-json-at-all');

  assert.deepEqual(metadata, {
    people: [],
    topics: [],
    thought_type: 'observation',
    action_items: [],
    context: 'unclassified',
  });
});
