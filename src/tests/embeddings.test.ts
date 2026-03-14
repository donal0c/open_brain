import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextualText } from '../services/embeddings.js';

test('buildContextualText leaves plain text unchanged when metadata is empty', () => {
  assert.equal(buildContextualText('hello world', {}), 'hello world');
});

test('buildContextualText prepends context, topics, and people', () => {
  const contextual = buildContextualText('Ship the feature', {
    context: 'creative',
    topics: ['launch plan', 'feature polish'],
    people: ['Donal'],
  });

  assert.equal(
    contextual,
    '[creative] [topics: launch plan, feature polish] [people: Donal] Ship the feature'
  );
});
