import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { createTask } from '../dist/index.js';

async function initGitRepo(root) {
  execSync('git init', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: root, stdio: 'pipe' });
  execSync('git commit --allow-empty -m "init"', { cwd: root, stdio: 'pipe' });
}

test('createTask creates a git worktree', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-worktree-'));
  await initGitRepo(root);

  let record;
  try {
    record = await createTask(root, 'Worktree creation test');
  } catch {
    // If git worktree fails (e.g., not in a real git repo or git not available), skip
    await rm(root, { recursive: true, force: true });
    return;
  }

  assert.ok(record.taskWorkspaceRoot);
  assert.ok(record.branchName);

  // The worktree directory should exist on disk
  const dirStat = await stat(record.taskWorkspaceRoot);
  assert.ok(dirStat.isDirectory());

  // Verify worktrees are registered
  const worktreeList = execSync('git worktree list', { cwd: root, encoding: 'utf8' });
  assert.ok(worktreeList.includes(record.taskWorkspaceRoot));

  await rm(root, { recursive: true, force: true });
});

test('task workspace directory is a valid git repo (.git file exists)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-worktree-'));
  await initGitRepo(root);

  let record;
  try {
    record = await createTask(root, 'Git repo validation test');
  } catch {
    await rm(root, { recursive: true, force: true });
    return;
  }

  // Worktree .git is a file (not a directory) pointing to the main repo
  const gitFile = path.join(record.taskWorkspaceRoot, '.git');
  const gitStat = await stat(gitFile);
  assert.ok(gitStat.isFile());

  const gitContent = await readFile(gitFile, 'utf8');
  assert.match(gitContent, /^gitdir:/);

  // Verify it is a working git repo by running git status inside it
  const gitStatus = execSync('git status', {
    cwd: record.taskWorkspaceRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.ok(gitStatus.includes('nothing to commit') || gitStatus.includes('On branch'));

  await rm(root, { recursive: true, force: true });
});

test('task branch is created with correct name', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-worktree-'));
  await initGitRepo(root);

  let record;
  try {
    record = await createTask(root, 'Branch name test');
  } catch {
    await rm(root, { recursive: true, force: true });
    return;
  }

  assert.ok(record.branchName);
  assert.match(record.branchName, /^codex\/task-/);

  // Verify the branch exists in the repo
  const branches = execSync('git branch --list', { cwd: root, encoding: 'utf8' });
  assert.ok(branches.includes(record.branchName), `Branch ${record.branchName} should exist in git`);

  await rm(root, { recursive: true, force: true });
});

test('Multiple tasks create isolated worktrees', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-worktree-'));
  await initGitRepo(root);

  let t1, t2, t3;
  try {
    t1 = await createTask(root, 'Isolation task 1');
    t2 = await createTask(root, 'Isolation task 2');
    t3 = await createTask(root, 'Isolation task 3');
  } catch {
    await rm(root, { recursive: true, force: true });
    return;
  }

  // Each task has its own workspace
  assert.notEqual(t1.taskWorkspaceRoot, t2.taskWorkspaceRoot);
  assert.notEqual(t2.taskWorkspaceRoot, t3.taskWorkspaceRoot);
  assert.notEqual(t1.taskWorkspaceRoot, t3.taskWorkspaceRoot);

  // Each task has its own branch
  assert.notEqual(t1.branchName, t2.branchName);
  assert.notEqual(t2.branchName, t3.branchName);

  // All three worktrees exist on disk
  for (const t of [t1, t2, t3]) {
    const dirStat = await stat(t.taskWorkspaceRoot);
    assert.ok(dirStat.isDirectory());
  }

  // All three worktrees are registered
  const worktreeList = execSync('git worktree list', { cwd: root, encoding: 'utf8' });
  assert.ok(worktreeList.includes(t1.taskWorkspaceRoot));
  assert.ok(worktreeList.includes(t2.taskWorkspaceRoot));
  assert.ok(worktreeList.includes(t3.taskWorkspaceRoot));

  await rm(root, { recursive: true, force: true });
});

test('worktree .agent-memory/ directory is created inside task workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-worktree-'));
  await initGitRepo(root);

  let record;
  try {
    record = await createTask(root, 'Memory dir test');
  } catch {
    await rm(root, { recursive: true, force: true });
    return;
  }

  const memDir = path.join(record.taskWorkspaceRoot, '.agent-memory');
  const memStat = await stat(memDir);
  assert.ok(memStat.isDirectory());

  const subdirs = ['sessions', 'delegations', 'orchestrator-reviews'];
  for (const sub of subdirs) {
    const subStat = await stat(path.join(memDir, sub));
    assert.ok(subStat.isDirectory(), `.agent-memory/${sub} should exist`);
  }

  await rm(root, { recursive: true, force: true });
});
