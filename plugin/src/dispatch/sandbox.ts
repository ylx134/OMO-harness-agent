import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface SandboxHandle {
  sandboxId: string;
  sandboxRoot: string;
}

const SANDBOX_STATE_FILENAME = '.sandbox-state.json';

export async function createSandbox(basePath?: string): Promise<SandboxHandle> {
  const base = basePath ?? os.tmpdir();
  const sandboxId = `sandbox-${randomUUID().slice(0, 12)}`;
  const sandboxRoot = path.join(base, sandboxId);
  await mkdir(sandboxRoot, { recursive: true });
  return { sandboxId, sandboxRoot };
}

export function resolveSandboxPath(sandboxRoot: string, subPath: string): string {
  const resolved = path.resolve(sandboxRoot, subPath);
  if (!isPathInSandbox(sandboxRoot, resolved)) {
    throw new Error(`Path escapes sandbox: ${subPath}`);
  }
  return resolved;
}

export function isPathInSandbox(sandboxRoot: string, targetPath: string): boolean {
  const rel = path.relative(sandboxRoot, targetPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export async function destroySandbox(sandboxRoot: string): Promise<void> {
  await rm(sandboxRoot, { recursive: true, force: true });
}

export async function saveSandboxState(sandboxRoot: string, state: Record<string, unknown>): Promise<void> {
  const filePath = path.join(sandboxRoot, SANDBOX_STATE_FILENAME);
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

export async function loadSandboxState(sandboxRoot: string): Promise<Record<string, unknown> | null> {
  const filePath = path.join(sandboxRoot, SANDBOX_STATE_FILENAME);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
