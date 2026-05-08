/**
 * Orchestrator Review — Delegated Role Completion Gate
 *
 * Ported from Codex plugin: role-boundary.mjs + orchestrator review MCP tools.
 *
 * Core idea: A delegated role (execution-manager, capability hands, probes)
 * cannot complete its work until the top-level orchestrator explicitly reviews
 * and accepts the result. Without an `accepted` review record, the completion
 * hook blocks the role from finishing.
 *
 * Files created under .agent-memory/orchestrator-reviews/:
 *   - pending.json       : actors awaiting review
 *   - reviews.jsonl      : append-only review log
 *   - <actor>.json       : latest review for a specific actor
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────

export type ReviewDecision = 'accepted' | 'request_changes' | 'rejected';

export type OrchestratorReview = {
  version: 1;
  reviewId: string;
  actor: string;
  phase: string;
  decision: ReviewDecision;
  reviewedBy: string;
  summary: string;
  ts: string;
};

export type DelegatedActorInfo = {
  actor: string;
  phase: string;
  actorRunId?: string;
  assignedAgentId?: string;
};

// ─── Constants ───────────────────────────────────────────────────

/**
 * Actors that count as "top-level orchestrator identity" and are NOT
 * allowed to self-approve delegated work. Ported from Codex's
 * ORCHESTRATOR_IDENTITIES set.
 */
export const ORCHESTRATOR_IDENTITIES = new Set([
  'main',
  'main-agent',
  'top-level',
  'top-level-agent',
  'harness-orchestrator',
  'orchestrator',
  'supervisor',
]);

/**
 * Actor kinds that DON'T require delegated agent review.
 * These are self-executing by nature.
 */
const SELF_EXECUTING_KINDS = new Set(['closure']);

// ─── Path Helpers ────────────────────────────────────────────────

function reviewsDir(root: string): string {
  return path.join(root, '.agent-memory', 'orchestrator-reviews');
}

function pendingPath(root: string): string {
  return path.join(reviewsDir(root), 'pending.json');
}

function reviewsLogPath(root: string): string {
  return path.join(reviewsDir(root), 'reviews.jsonl');
}

function actorReviewPath(root: string, actor: string): string {
  const safeName = actor.replace(/[^a-zA-Z0-9_.:-]+/g, '_');
  return path.join(reviewsDir(root), `${safeName}.json`);
}

// ─── File I/O ────────────────────────────────────────────────────

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(target: string, fallback: T): Promise<T> {
  if (!(await exists(target))) return fallback;
  return JSON.parse(await fs.readFile(target, 'utf8')) as T;
}

async function writeJson(target: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function appendJsonLine(target: string, row: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(row)}\n`, 'utf8');
}

async function readJsonLines<T>(target: string): Promise<T[]> {
  if (!(await exists(target))) return [];
  const text = await fs.readFile(target, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line)) as T[];
}

// ─── Core Logic (ported from Codex role-boundary.mjs) ────────────

/**
 * Check whether an actor kind requires a real delegated agent
 * (i.e. cannot be self-executed by orchestrator).
 */
export function actorRequiresDelegatedAgent(
  actor: string,
  kind?: string,
): boolean {
  if (!actor) return false;
  if (SELF_EXECUTING_KINDS.has(kind ?? '')) return false;
  if (actor === 'acceptance-closure') return false;
  return true;
}

/**
 * Determine the kind of actor from its name.
 */
export function actorKind(actor: string): string {
  if (actor === 'acceptance-closure' || actor.endsWith(':closure')) return 'closure';
  if (actor.endsWith('-probe-agent')) return 'probe';
  if (
    actor.endsWith('-manager')
    || actor === 'feature-planner'
    || actor === 'capability-planner'
  ) {
    return 'manager';
  }
  return 'hand';
}

// ─── Pending Reviews ─────────────────────────────────────────────

/**
 * Register that a delegated actor has completed work and is awaiting review.
 */
export async function registerPendingReview(
  root: string,
  info: DelegatedActorInfo,
): Promise<void> {
  const pending = await readJson<DelegatedActorInfo[]>(pendingPath(root), []);
  // Remove any stale entry for the same actor
  const filtered = pending.filter((p) => p.actor !== info.actor);
  filtered.push(info);
  await writeJson(pendingPath(root), filtered);
}

/**
 * Get all actors awaiting orchestrator review.
 */
export async function getPendingReviews(root: string): Promise<DelegatedActorInfo[]> {
  return readJson<DelegatedActorInfo[]>(pendingPath(root), []);
}

/**
 * Remove a pending review after it has been resolved.
 */
export async function clearPendingReview(root: string, actor: string): Promise<void> {
  const pending = await readJson<DelegatedActorInfo[]>(pendingPath(root), []);
  const filtered = pending.filter((p) => p.actor !== actor);
  await writeJson(pendingPath(root), filtered);
}

// ─── Review Recording ────────────────────────────────────────────

let reviewCounter = 0;

/**
 * Record an orchestrator review for a delegated actor's work.
 */
export async function recordReview(
  root: string,
  review: Omit<OrchestratorReview, 'version' | 'reviewId' | 'ts'>,
): Promise<OrchestratorReview> {
  const full: OrchestratorReview = {
    version: 1,
    reviewId: `rev-${Date.now()}-${++reviewCounter}`,
    ts: new Date().toISOString(),
    ...review,
  };

  // Append to reviews log
  await appendJsonLine(reviewsLogPath(root), full);

  // Update per-actor latest review
  await writeJson(actorReviewPath(root, review.actor), full);

  // Clear from pending
  await clearPendingReview(root, review.actor);

  return full;
}

/**
 * Get the latest review decision for a specific actor.
 */
export async function getLatestReview(
  root: string,
  actor: string,
): Promise<OrchestratorReview | null> {
  return readJson<OrchestratorReview | null>(
    actorReviewPath(root, actor),
    null,
  );
}

/**
 * Check if an actor has an accepted review on file.
 * Returns true if the actor doesn't require delegated review
 * (i.e. is self-executing).
 */
export async function hasAcceptedReview(
  root: string,
  actor: string,
): Promise<boolean> {
  const kind = actorKind(actor);
  if (!actorRequiresDelegatedAgent(actor, kind)) return true;

  const latest = await getLatestReview(root, actor);
  return latest?.decision === 'accepted';
}

// ─── Validation (ported from Codex validateAssignedAgent) ────────

/**
 * Validate that a delegated role completion was done by the
 * correct assigned agent, not by a top-level orchestrator identity.
 *
 * Returns { ok: true } if the completion is valid,
 * or { ok: false, reason } if it should be blocked.
 */
export function validateCompletion(
  actor: string,
  completingAgent: string,
  expectedAssignedAgentId?: string,
): { ok: true } | { ok: false; reason: string } {
  const kind = actorKind(actor);
  if (!actorRequiresDelegatedAgent(actor, kind)) {
    return { ok: true };
  }

  const actual = (completingAgent || '').trim();
  if (!actual) {
    return { ok: false, reason: `actor ${actor} must be completed by its assigned subagent` };
  }

  if (ORCHESTRATOR_IDENTITIES.has(actual)) {
    return {
      ok: false,
      reason: `actor ${actor} cannot be self-completed by top-level orchestrator identity "${actual}" — delegated work requires real sub-agent execution`,
    };
  }

  const expected = (expectedAssignedAgentId || '').trim();
  if (expected && actual !== expected) {
    return {
      ok: false,
      reason: `actor ${actor} assignedAgentId mismatch: expected ${expected}, got ${actual}`,
    };
  }

  return { ok: true };
}

// ─── Review Required Check ───────────────────────────────────────

/**
 * Check whether an actor's completion is blocked pending orchestrator review.
 *
 * Returns null if no review is needed (actor complete or self-executing),
 * or a reason string if the completion is blocked pending review.
 */
export async function completionBlockedPendingReview(
  root: string,
  actor: string,
): Promise<string | null> {
  const kind = actorKind(actor);
  if (!actorRequiresDelegatedAgent(actor, kind)) return null;

  const hasAccepted = await hasAcceptedReview(root, actor);
  if (hasAccepted) return null;

  return `actor "${actor}" completion blocked: no accepted orchestrator review on file. The top-level agent must review the sub-agent result (accepted/request_changes/rejected) before this role can complete.`;
}

// ─── Review Summary ──────────────────────────────────────────────

/**
 * Build a summary of all orchestrator reviews for a session.
 */
export async function getReviewsSummary(root: string): Promise<{
  total: number;
  accepted: number;
  requestChanges: number;
  rejected: number;
  pending: number;
  reviews: OrchestratorReview[];
}> {
  const reviews = await readJsonLines<OrchestratorReview>(reviewsLogPath(root));
  const pending = await getPendingReviews(root);
  return {
    total: reviews.length,
    accepted: reviews.filter((r) => r.decision === 'accepted').length,
    requestChanges: reviews.filter((r) => r.decision === 'request_changes').length,
    rejected: reviews.filter((r) => r.decision === 'rejected').length,
    pending: pending.length,
    reviews: reviews.slice(-10), // last 10
  };
}
