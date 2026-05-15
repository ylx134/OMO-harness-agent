import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface SandboxState {
  sandboxId: string;
  sandboxRoot: string;
  createdAt: string;
  fileCount: number;
}

function sandboxDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agent-memory', 'sandboxes');
}

function statePath(workspaceRoot: string, sandboxId: string): string {
  return path.join(sandboxDir(workspaceRoot), `${sandboxId}.json`);
}

export async function createSandbox(
  workspaceRoot: string,
  sandboxId?: string,
): Promise<{ sandboxId: string; sandboxRoot: string }> {
  const id = sandboxId ?? randomUUID();
  const root = path.join(sandboxDir(workspaceRoot), id);

  await fs.mkdir(root, { recursive: true });

  const state: SandboxState = {
    sandboxId: id,
    sandboxRoot: root,
    createdAt: new Date().toISOString(),
    fileCount: 0,
  };

  await fs.mkdir(path.dirname(statePath(workspaceRoot, id)), { recursive: true });
  await fs.writeFile(statePath(workspaceRoot, id), JSON.stringify(state, null, 2) + '\n', 'utf8');

  return { sandboxId: id, sandboxRoot: root };
}

export function resolveSandboxPath(sandboxRoot: string, requestedPath: string): string {
  const resolved = path.resolve(sandboxRoot, requestedPath);

  if (!resolved.startsWith(path.resolve(sandboxRoot) + path.sep) && resolved !== path.resolve(sandboxRoot)) {
    throw new Error(`Path escapes sandbox: ${requestedPath} → ${resolved}`);
  }

  return resolved;
}

export function isPathInSandbox(sandboxRoot: string, requestedPath: string): boolean {
  try {
    resolveSandboxPath(sandboxRoot, requestedPath);
    return true;
  } catch {
    return false;
  }
}

export async function destroySandbox(workspaceRoot: string, sandboxId: string): Promise<void> {
  const sp = statePath(workspaceRoot, sandboxId);

  try {
    await fs.unlink(sp);
  } catch {
    // state file may not exist — ok
  }

  const dir = path.join(sandboxDir(workspaceRoot), sandboxId);
  await fs.rm(dir, { recursive: true, force: true });
}
