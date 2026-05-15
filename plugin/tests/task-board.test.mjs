import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import {
  loadBoard,
  createTask,
  getTaskById,
  getTaskByDir,
  updateTaskStatus,
  listTasks,
  createTaskId,
  archiveTask,
  resolveTaskForWorkspace,
} from '../dist/index.js';

async function initGitRepo(root) {
  execSync('git init', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: root, stdio: 'pipe' });
  execSync('git commit --allow-empty -m "init"', { cwd: root, stdio: 'pipe' });
}

test('loadBoard returns empty board when no file exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  const board = await loadBoard(root);
  assert.deepEqual(board, { version: 1, tasks: [] });
  await rm(root, { recursive: true, force: true });
});

test('createTaskId generates valid task-* IDs', async () => {
  const id = createTaskId();
  assert.match(id, /^task-[a-z0-9]+-[a-f0-9]+$/);
  assert.ok(id.startsWith('task-'));
});

test('createTaskId generates unique IDs', async () => {
  const ids = new Set(Array.from({ length: 20 }, () => createTaskId()));
  assert.equal(ids.size, 20);
});

test('createTask creates task record with all fields populated', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const record = await createTask(root, 'Test task description', 'F-M1');

  assert.ok(record.taskId);
  assert.match(record.taskId, /^task-/);
  assert.equal(record.status, 'pending');
  assert.ok(record.branchName);
  assert.equal(record.workspaceRoot, root);
  assert.ok(record.taskWorkspaceRoot);
  assert.equal(record.task, 'Test task description');
  assert.equal(record.routeId, 'F-M1');
  assert.ok(record.createdAt);
  assert.ok(record.updatedAt);
  assert.equal(record.sessionId, null);

  await rm(root, { recursive: true, force: true });
});

test('createTask creates .harness-worktrees/<taskId> directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const record = await createTask(root, 'Test task');

  const worktreePath = path.join(root, '.harness-worktrees', record.taskId);
  const dirStat = await stat(worktreePath);
  assert.ok(dirStat.isDirectory());

  await rm(root, { recursive: true, force: true });
});

test('createTask creates .agent-memory/ subdirectories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const record = await createTask(root, 'Test task');

  const memDir = path.join(record.taskWorkspaceRoot, '.agent-memory');
  assert.ok((await stat(memDir)).isDirectory());
  assert.ok((await stat(path.join(memDir, 'sessions'))).isDirectory());
  assert.ok((await stat(path.join(memDir, 'delegations'))).isDirectory());
  assert.ok((await stat(path.join(memDir, 'orchestrator-reviews'))).isDirectory());

  await rm(root, { recursive: true, force: true });
});

test('createTask appends to board', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  await createTask(root, 'Task 1');
  const board = await loadBoard(root);
  assert.equal(board.tasks.length, 1);

  await createTask(root, 'Task 2');
  const board2 = await loadBoard(root);
  assert.equal(board2.tasks.length, 2);

  await rm(root, { recursive: true, force: true });
});

test('getTaskById finds existing task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const created = await createTask(root, 'Find me');
  const found = await getTaskById(root, created.taskId);

  assert.ok(found);
  assert.equal(found.taskId, created.taskId);
  assert.equal(found.task, 'Find me');

  await rm(root, { recursive: true, force: true });
});

test('getTaskById returns null for non-existent task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  const found = await getTaskById(root, 'task-nonexistent');
  assert.equal(found, null);
  await rm(root, { recursive: true, force: true });
});

test('getTaskByDir finds task by workspace directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const created = await createTask(root, 'Dir match task');
  const found = await getTaskByDir(root, created.taskWorkspaceRoot);

  assert.ok(found);
  assert.equal(found.taskId, created.taskId);

  await rm(root, { recursive: true, force: true });
});

test('getTaskByDir returns null for unmatched directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  const found = await getTaskByDir(root, '/nonexistent/path');
  assert.equal(found, null);
  await rm(root, { recursive: true, force: true });
});

test('updateTaskStatus changes status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const created = await createTask(root, 'Status task');
  assert.equal(created.status, 'pending');

  const updated = await updateTaskStatus(root, created.taskId, 'in_progress');
  assert.equal(updated.status, 'in_progress');
  assert.ok(new Date(updated.updatedAt) > new Date(created.updatedAt));

  // Verify persistence
  const found = await getTaskById(root, created.taskId);
  assert.equal(found.status, 'in_progress');

  await rm(root, { recursive: true, force: true });
});

test('updateTaskStatus returns null for non-existent task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  const result = await updateTaskStatus(root, 'task-nonexistent', 'in_progress');
  assert.equal(result, null);
  await rm(root, { recursive: true, force: true });
});

test('updateTaskStatus stores sessionId when provided', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const created = await createTask(root, 'Session task');
  const updated = await updateTaskStatus(root, created.taskId, 'in_progress', 'ses_abc123');
  assert.equal(updated.sessionId, 'ses_abc123');

  const found = await getTaskById(root, created.taskId);
  assert.equal(found.sessionId, 'ses_abc123');

  await rm(root, { recursive: true, force: true });
});

test('listTasks returns all non-archived tasks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  await createTask(root, 'Task 1');
  await createTask(root, 'Task 2');
  await createTask(root, 'Task 3');

  const tasks = await listTasks(root);
  assert.equal(tasks.length, 3);
  assert.ok(tasks.every((t) => t.status !== 'archived'));

  await rm(root, { recursive: true, force: true });
});

test('listTasks excludes archived tasks after archiveTask', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const t1 = await createTask(root, 'Keep me');
  const t2 = await createTask(root, 'Archive me');

  await archiveTask(root, t2.taskId);

  const tasks = await listTasks(root);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].taskId, t1.taskId);

  await rm(root, { recursive: true, force: true });
});

test('archiveTask changes status to archived', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const created = await createTask(root, 'Archive this');
  const archived = await archiveTask(root, created.taskId);

  assert.equal(archived.status, 'archived');
  assert.ok(new Date(archived.updatedAt) > new Date(created.updatedAt));

  // Verify the board still has it (archived, not removed)
  const board = await loadBoard(root);
  const found = board.tasks.find((t) => t.taskId === created.taskId);
  assert.ok(found);
  assert.equal(found.status, 'archived');

  await rm(root, { recursive: true, force: true });
});

test('archiveTask returns null for non-existent task', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  const result = await archiveTask(root, 'task-nonexistent');
  assert.equal(result, null);
  await rm(root, { recursive: true, force: true });
});

test('resolveTaskForWorkspace finds task by workspace directory match', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const created = await createTask(root, 'Resolve me');
  const resolved = resolveTaskForWorkspace(root, created.taskWorkspaceRoot);

  assert.ok(resolved);
  assert.equal(resolved.taskId, created.taskId);

  await rm(root, { recursive: true, force: true });
});

test('resolveTaskForWorkspace returns null for unmatched directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  const result = resolveTaskForWorkspace(root, '/no/such/dir');
  assert.equal(result, null);
  await rm(root, { recursive: true, force: true });
});

test('Multiple tasks can be created and listed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const t1 = await createTask(root, 'Task Alpha');
  const t2 = await createTask(root, 'Task Beta');
  const t3 = await createTask(root, 'Task Gamma');

  const tasks = await listTasks(root);
  assert.equal(tasks.length, 3);
  const taskIds = tasks.map((t) => t.taskId);
  assert.ok(taskIds.includes(t1.taskId));
  assert.ok(taskIds.includes(t2.taskId));
  assert.ok(taskIds.includes(t3.taskId));

  await rm(root, { recursive: true, force: true });
});

test('board persists tasks across loads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-task-board-'));
  await initGitRepo(root);

  const created = await createTask(root, 'Persistent task');

  // Load board fresh and verify
  const board = await loadBoard(root);
  const found = board.tasks.find((t) => t.taskId === created.taskId);
  assert.ok(found);
  assert.equal(found.task, 'Persistent task');

  await rm(root, { recursive: true, force: true });
});
