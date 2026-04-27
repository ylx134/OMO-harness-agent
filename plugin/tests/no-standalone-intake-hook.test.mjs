import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function shellArrayBlock(script, name) {
  const match = script.match(new RegExp(`${name}=\\(\\n([\\s\\S]*?)\\n\\)`));
  return match?.[1] || '';
}

test('installer does not publish standalone command intake hooks that can overwrite dispatch state', async () => {
  const setup = await readFile(path.join(repoRoot, 'setup.sh'), 'utf8');
  const uninstall = await readFile(path.join(repoRoot, 'uninstall.sh'), 'utf8');
  const setupHooks = shellArrayBlock(setup, 'HOOKS');
  const deprecatedHooks = shellArrayBlock(setup, 'DEPRECATED_HOOKS');

  assert.doesNotMatch(setupHooks, /command-interceptor\.js/);
  assert.doesNotMatch(setup, /harness-intake\.mjs/);
  assert.doesNotMatch(setup, /npm install --no-save/);
  assert.match(deprecatedHooks, /command-interceptor\.js/);
  assert.match(uninstall, /DEPRECATED_HOOKS[\s\S]*command-interceptor\.js/);
});
