import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminHttpEnabled } from '../http-config.js';

test('isAdminHttpEnabled defaults to false', () => {
  assert.equal(isAdminHttpEnabled(undefined), false);
  assert.equal(isAdminHttpEnabled('false'), false);
});

test('isAdminHttpEnabled only enables explicit true', () => {
  assert.equal(isAdminHttpEnabled('true'), true);
});
