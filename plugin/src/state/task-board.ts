import { promises as fs } from 'node:fs';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCb);

function nowIso(): string {
  return new Date().toISOString();
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]+/g, '_');
}

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'archived';

type TaskRecord = {
  taskId: string;
  task: string;
  status: TaskStatus;
  workspaceRoot: string;
  taskWorkspaceRoot: string;
  branchName: string;
  routeId: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type TaskBoard = {
  version: 1;
  tasks: TaskRecord[];
};

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function boardPath(root: string): string {
  return path.join(root, '.harness-board', 'tasks.json');
}

function worktreeDir(root: string, taskId: string): string {
  return path.join(root, '.harness-worktrees', safeId(taskId));
}

function taskMemoryDir(taskWorkspaceRoot: string): string {
  return path.join(taskWorkspaceRoot, '.agent-memory');
}

// ── File-based advisory lock ────────────────────────────────────────────────

interface LockOptions {
  /** Milliseconds before a lock is considered stale (default 5 min). */
  staleMs?: number;
  /** Milliseconds to keep retrying before giving up (default 5000). */
  timeoutMs?: number;
}

/**
 * Acquire a file-system advisory lock using mkdir atomicity.
 * On EEXIST the owner.json is inspected; stale locks are removed and retried.
 *
 * @returns a synchronous release function.
 */
async function acquireBoardLock(boardRoot: string, options?: LockOptions): Promise<() => void> {
  const lockDir = path.join(boardRoot, '.lock');
  const staleMs = options?.staleMs ?? 300_000;
  const retryInterval = 25;
  const deadline = Date.now() + (options?.timeoutMs ?? 5_000);

  let released = false;

  try { mkdirSync(boardRoot, { recursive: true }); } catch { /* noop */ }

  while (true) {
    try {
      mkdirSync(lockDir);
      try {
        const owner = { pid: process.pid, timestamp: Date.now() };
        const ownerPath = path.join(lockDir, 'owner.json');
        writeFileSync(ownerPath, JSON.stringify(owner), 'utf8');
      } catch { /* best-effort metadata */ }
      break;
    } catch (err: any) {
      if (err.code !== 'EEXIST' && err.code !== 'ENOTEMPTY') throw err;

      const ownerPath = path.join(lockDir, 'owner.json');
      let stale = false;
      try {
        const raw = readFileSync(ownerPath, 'utf8');
        const owner = JSON.parse(raw);
        if (Date.now() - owner.timestamp > staleMs) stale = true;
      } catch {
        stale = true;
      }

      if (stale) {
        try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* noop */ }
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Could not acquire lock at ${lockDir} within ${options?.timeoutMs ?? 5_000}ms`,
        );
      }

      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }

  return () => {
    if (released) return;
    released = true;
    try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* noop */ }
  };
}

/**
 * Acquire the board lock, execute `fn`, then release.
 */
async function withBoardLock<T>(boardRoot: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireBoardLock(boardRoot);
  try {
    return await fn();
  } finally {
    release();
  }
}

// ── Atomic JSON writes ──────────────────────────────────────────────────────

/**
 * Write JSON atomically: write to `filePath.<pid>.<timestamp>.tmp`,
 * then fs.rename to `filePath`.  Rename is atomic on the same filesystem.
 */
async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmpFile, filePath);
}

export function createTaskId(): string {
  return `task-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function loadBoard(root: string): Promise<TaskBoard> {
  return readJson<TaskBoard>(boardPath(root), { version: 1, tasks: [] });
}

export async function createTask(
  root: string,
  task: string,
  routeId: string | null = null,
): Promise<TaskRecord> {
  return withBoardLock(root, async () => {
    const board = await loadBoard(root);
    const taskId = createTaskId();
    const timestamp = nowIso();
    const branchName = `codex/${safeId(taskId)}`;
    const taskWorkspaceRoot = worktreeDir(root, taskId);

    try {
      await exec(`git worktree add -b ${branchName} ${taskWorkspaceRoot}`, {
        cwd: root,
      });
    } catch (err: any) {
      if (err.stderr && /already exists/i.test(String(err.stderr))) {
        try { await exec(`git worktree remove --force ${taskWorkspaceRoot}`, { cwd: root }); } catch { /* noop */ }
        await exec(`git worktree add -b ${branchName} ${taskWorkspaceRoot}`, { cwd: root });
      } else if (err.message && /already exists/i.test(String(err.message))) {
        // swallow — worktree already checked out
      } else {
        throw err;
      }
    }

    await fs.mkdir(taskMemoryDir(taskWorkspaceRoot), { recursive: true });
    await fs.mkdir(path.join(taskMemoryDir(taskWorkspaceRoot), 'orchestrator-reviews'), { recursive: true });
    await fs.mkdir(path.join(taskMemoryDir(taskWorkspaceRoot), 'sessions'), { recursive: true });
    await fs.mkdir(path.join(taskMemoryDir(taskWorkspaceRoot), 'delegations'), { recursive: true });

    const record: TaskRecord = {
      taskId,
      task,
      status: 'pending',
      workspaceRoot: root,
      taskWorkspaceRoot,
      branchName,
      routeId,
      sessionId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    board.tasks.push(record);
    await writeJsonAtomic(boardPath(root), board);
    return record;
  });
}

export async function getTaskById(root: string, taskId: string): Promise<TaskRecord | null> {
  const board = await loadBoard(root);
  return board.tasks.find((t) => t.taskId === taskId) ?? null;
}

export async function getTaskByDir(root: string, dir: string): Promise<TaskRecord | null> {
  const board = await loadBoard(root);
  const resolved = path.resolve(dir);
  return board.tasks.find(
    (t) => path.resolve(t.taskWorkspaceRoot).startsWith(resolved) || resolved.startsWith(path.resolve(t.taskWorkspaceRoot)),
  ) ?? null;
}

export async function updateTaskStatus(
  root: string,
  taskId: string,
  status: TaskStatus,
  sessionId?: string | null,
): Promise<TaskRecord | null> {
  return withBoardLock(root, async () => {
    const board = await loadBoard(root);
    const task = board.tasks.find((t) => t.taskId === taskId);
    if (!task) return null;
    task.status = status;
    task.updatedAt = nowIso();
    if (sessionId !== undefined) task.sessionId = sessionId;
    await writeJsonAtomic(boardPath(root), board);
    return task;
  });
}

export async function listTasks(root: string): Promise<TaskRecord[]> {
  const board = await loadBoard(root);
  return board.tasks.filter((t) => t.status !== 'archived');
}

export async function archiveTask(root: string, taskId: string): Promise<TaskRecord | null> {
  return withBoardLock(root, async () => {
    const board = await loadBoard(root);
    const task = board.tasks.find((t) => t.taskId === taskId);
    if (!task) return null;

    task.status = 'archived';
    task.updatedAt = nowIso();

    try {
      await exec(`git worktree remove --force ${task.taskWorkspaceRoot}`, {
        cwd: root,
      });
    } catch { /* worktree may already be gone */ }

    try {
      await exec(`git branch -D ${task.branchName}`, {
        cwd: root,
      });
    } catch { /* branch may already be gone */ }

    await writeJsonAtomic(boardPath(root), board);
    return task;
  });
}

export function resolveTaskForWorkspace(root: string, workspaceDir: string): TaskRecord | null {
  const resolved = path.resolve(workspaceDir);
  try {
    const board = loadBoardSync(root);
    return board.tasks.find(
      (t) =>
        path.resolve(t.taskWorkspaceRoot) === resolved ||
        path.resolve(t.taskWorkspaceRoot).startsWith(resolved + path.sep) ||
        resolved.startsWith(path.resolve(t.taskWorkspaceRoot)),
    ) ?? null;
  } catch {
    return null;
  }
}

function loadBoardSync(root: string): TaskBoard {
  try {
    const raw = readFileSync(boardPath(root), 'utf8');
    return JSON.parse(raw) as TaskBoard;
  } catch {
    return { version: 1, tasks: [] };
  }
}
