import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const pluginRoot = fileURLToPath(new URL('..', import.meta.url));

test('sync-routing-table fails loudly when the source routing table is missing', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'routing-sync-'));
  const tempPluginRoot = path.join(tempRoot, 'plugin');

  await mkdir(tempPluginRoot, { recursive: true });
  await cp(path.join(pluginRoot, 'scripts'), path.join(tempPluginRoot, 'scripts'), { recursive: true });

  await assert.rejects(
    execFileAsync('node', [path.join(tempPluginRoot, 'scripts', 'sync-routing-table.mjs')], {
      cwd: tempPluginRoot,
    }),
    /ENOENT|routing-table/i,
  );

  await rm(tempRoot, { recursive: true, force: true });
});
