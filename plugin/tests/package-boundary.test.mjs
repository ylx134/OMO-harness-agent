import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginRoot = fileURLToPath(new URL('..', import.meta.url));

async function copyIfExists(source, destination) {
  try {
    await cp(source, destination, { recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

test('public package boots from an isolated plugin directory without repo-root runtime dependencies', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'omo-harness-package-'));
  const isolatedPluginRoot = path.join(tempRoot, 'plugin');

  await copyIfExists(path.join(pluginRoot, 'index.js'), path.join(isolatedPluginRoot, 'index.js'));
  await copyIfExists(path.join(pluginRoot, 'package.json'), path.join(isolatedPluginRoot, 'package.json'));
  await copyIfExists(path.join(pluginRoot, 'dist'), path.join(isolatedPluginRoot, 'dist'));
  await copyIfExists(path.join(pluginRoot, 'config'), path.join(isolatedPluginRoot, 'config'));

  const plugin = await import(pathToFileURL(path.join(isolatedPluginRoot, 'index.js')).href);

  assert.equal(plugin.id, 'omo-harness-plugin');
  assert.equal(typeof plugin.server, 'function');

  await rm(tempRoot, { recursive: true, force: true });
});
