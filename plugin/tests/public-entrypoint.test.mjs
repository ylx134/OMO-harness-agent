import test from 'node:test';
import assert from 'node:assert/strict';

import plugin, { id, server } from '../index.js';

test('public plugin entrypoint exports id and server', () => {
  assert.equal(id, 'omo-harness-plugin');
  assert.equal(typeof server, 'function');
  assert.equal(plugin.id, id);
  assert.equal(plugin.server, server);
});
