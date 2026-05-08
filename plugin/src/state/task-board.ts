import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  const board = await loadBoard(root);
  const taskId = createTaskId();
  const timestamp = nowIso();
  const branchName = `codex/${safeId(taskId)}`;
  const taskWorkspaceRoot = worktreeDir(root, taskId);

  await fs.mkdir(taskWorkspaceRoot, { recursive: true });
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
  await writeJson(boardPath(root), board);
  return record;
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
  const board = await loadBoard(root);
  const task = board.tasks.find((t) => t.taskId === taskId);
  if (!task) return null;
  task.status = status;
  task.updatedAt = nowIso();
  if (sessionId !== undefined) task.sessionId = sessionId;
  await writeJson(boardPath(root), board);
  return task;
}

export async function listTasks(root: string): Promise<TaskRecord[]> {
  const board = await loadBoard(root);
  return board.tasks.filter((t) => t.status !== 'archived');
}
