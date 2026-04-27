#!/usr/bin/env node
/**
 * Harness Intake Runner — called by standalone hook command-interceptor.js
 * Usage: node scripts/harness-intake.mjs <workspace> <command> <message>
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { appendFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
  const pluginIndexPath = resolve(__dirname, '..', 'plugin', 'dist', 'index.js');

async function main() {
  const [,, workspace, command, message] = process.argv;

  if (!workspace || !command) {
    console.error('Usage: node harness-intake.mjs <workspace> <command> <message>');
    process.exit(1);
  }

  try {
    const { initializeHarnessTask, loadPluginState } = await import(pluginIndexPath);

    if (command === 'control') {
      await initializeHarnessTask(workspace, message || '', 'harness-orchestrator', '', true);

      const { state } = await loadPluginState(workspace);
      const debugPath = `${workspace}/.agent-memory/harness-plugin-debug.log`;
      await appendFile(debugPath, JSON.stringify({
        event: 'command.intercepted',
        command,
        routeId: state?.routeId,
        currentPhase: state?.currentPhase,
        ts: new Date().toISOString(),
      }) + '\n');
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: 'intake_runner_error',
      error: error?.message || String(error),
    }));
  }
}

main();
