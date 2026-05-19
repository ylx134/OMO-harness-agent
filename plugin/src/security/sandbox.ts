import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveSandboxPath as _resolve,
  isPathInSandbox as _isIn,
  destroySandbox as _destroy,
  saveSandboxState,
  loadSandboxState,
} from '../dispatch/sandbox.js';

export { saveSandboxState, loadSandboxState };
export const resolveSandboxPath = _resolve;
export const isPathInSandbox = _isIn;

function sandboxDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agent-memory', 'sandboxes');
}

export async function createSandbox(
  workspaceRoot: string,
  sandboxId?: string,
): Promise<{ sandboxId: string; sandboxRoot: string }> {
  const id = sandboxId ?? randomUUID();
  const root = path.join(sandboxDir(workspaceRoot), id);
  await mkdir(root, { recursive: true });
  return { sandboxId: id, sandboxRoot: root };
}

export async function destroySandbox(workspaceRoot: string, sandboxId: string): Promise<void> {
  const root = path.join(sandboxDir(workspaceRoot), sandboxId);
  await _destroy(root);
}
