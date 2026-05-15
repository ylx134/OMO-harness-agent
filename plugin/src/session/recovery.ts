// @ts-nocheck
import type { SessionStore, SessionEvent } from '../state/session-store.js';
import { loadPluginState, savePluginState } from '../state/storage.js';

const COMPLETION_EVENT_TYPES = new Set([
  'session.completed',
  'actor.completed',
  'route.completed',
]);

const STALE_LOCK_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Read all events for a session, find the last non-completion event,
 * and rebuild the currently active actor.
 */
export async function resumeFromLastEvent(
  store: SessionStore,
  sessionId: string,
): Promise<{
  events: SessionEvent[];
  lastEvent: SessionEvent | null;
  activeActor: string | null;
}> {
  const events = await store.getEvents(sessionId);

  let lastEvent: SessionEvent | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    if (!COMPLETION_EVENT_TYPES.has(events[i].type)) {
      lastEvent = events[i];
      break;
    }
  }

  const activeActor = lastEvent?.actor ?? lastEvent?.payload?.actor ?? null;

  return { events, lastEvent, activeActor: String(activeActor || '') || null };
}

/**
 * Read harness-plugin-state.json, scan file write locks, and release
 * any lock whose `acquiredAt` timestamp is older than 5 minutes.
 */
export async function repairDerivedState(workspace: string): Promise<void> {
  const { state } = await loadPluginState(workspace);
  if (!state) return;

  const locks = state.fileWriteLocks || {};
  const now = Date.now();
  let changed = false;
  const repairedLocks: Record<string, unknown> = {};

  for (const [lockPath, lock] of Object.entries(locks) as [string, Record<string, unknown>][]) {
    const acquiredAt = lock?.acquiredAt as string | undefined;
    if (acquiredAt) {
      const lockAge = now - Date.parse(acquiredAt);
      if (lockAge > STALE_LOCK_AGE_MS) {
        changed = true;
        continue; // drop stale lock
      }
    }
    repairedLocks[lockPath] = lock;
  }

  if (changed) {
    await savePluginState(workspace, { ...state, fileWriteLocks: repairedLocks });
  }
}

/**
 * Wake a session: resume from its last event and repair derived workspace
 * state to determine the current run-time status.
 */
export async function wake(
  store: SessionStore,
  sessionId: string,
): Promise<{
  status: 'blocked' | 'completed' | 'active' | 'runnable';
  lastEvent: SessionEvent | null;
}> {
  const { events, lastEvent } = await resumeFromLastEvent(store, sessionId);

  // Derive workspace root from the session record so we can repair derived state.
  const session = await store.getSession(sessionId);
  const workspace = session?.workspaceRoot;
  if (workspace) {
    await repairDerivedState(workspace);
  }

  if (!events || events.length === 0) {
    return { status: 'runnable', lastEvent: null };
  }

  const hasCompletion = events.some((e) => e.type === 'session.completed');
  if (hasCompletion) {
    return { status: 'completed', lastEvent };
  }

  const hasBlocked = events.some((e) => e.type === 'actor.blocked');
  if (hasBlocked) {
    return { status: 'blocked', lastEvent };
  }

  return { status: 'active', lastEvent };
}
