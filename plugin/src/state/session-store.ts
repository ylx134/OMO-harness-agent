import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function nowIso(): string {
  return new Date().toISOString();
}

function createSessionId(): string {
  return `sess-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

function isPlainObject(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown> | null): Record<string, unknown> {
  const output = { ...target };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else if (isPlainObject(value)) {
      output[key] = deepMerge({}, value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export type SessionEvent = {
  version: number;
  seq: number;
  ts: string;
  sessionId: string;
  type: string;
  actor?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SessionRecord = {
  version: number;
  sessionId: string;
  task: string;
  routeId: string | null;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
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

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line)) as T[];
  } catch {
    return [];
  }
}

async function appendJsonLine(filePath: string, row: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}

export class SessionStore {
  #workspaceRoot: string;
  #memoryDir: string;
  #sessionsDir: string;

  constructor({ workspaceRoot }: { workspaceRoot: string }) {
    this.#workspaceRoot = workspaceRoot;
    this.#memoryDir = path.join(workspaceRoot, '.agent-memory');
    this.#sessionsDir = path.join(this.#memoryDir, 'sessions');
  }

  #sessionDir(sessionId: string): string {
    return path.join(this.#sessionsDir, sessionId);
  }

  #sessionFile(sessionId: string): string {
    return path.join(this.#sessionDir(sessionId), 'session.json');
  }

  #eventsFile(sessionId: string): string {
    return path.join(this.#sessionDir(sessionId), 'events.jsonl');
  }

  #statePatchesFile(sessionId: string): string {
    return path.join(this.#sessionDir(sessionId), 'state-patches.jsonl');
  }

  async #ensureSessionDir(sessionId: string): Promise<void> {
    await fs.mkdir(this.#sessionDir(sessionId), { recursive: true });
  }

  async createSession({ task, routeId, workspaceRoot }: { task: string; routeId?: string | null; workspaceRoot?: string }): Promise<SessionRecord> {
    const sessionId = createSessionId();
    const createdAt = nowIso();
    const wr = workspaceRoot ?? this.#workspaceRoot;
    const session: SessionRecord = {
      version: 1,
      sessionId,
      task,
      routeId: routeId ?? null,
      workspaceRoot: wr,
      createdAt,
      updatedAt: createdAt,
    };

    await this.#ensureSessionDir(sessionId);
    await writeJson(this.#sessionFile(sessionId), session);
    await writeJson(this.#statePatchesFile(sessionId), []);
    await this.emitEvent(sessionId, { type: 'session.created', payload: { task, routeId: routeId ?? null } });

    const latest = { version: 1, sessionId, task, routeId: routeId ?? null, workspaceRoot: wr, updatedAt: createdAt };
    await writeJson(path.join(this.#memoryDir, 'latest-session.json'), latest);
    await writeJson(path.join(this.#sessionsDir, 'latest-session.json'), latest);

    return this.getSession(sessionId);
  }

  async getSession(sessionId: string): Promise<SessionRecord> {
    return readJson(this.#sessionFile(sessionId), {} as SessionRecord);
  }

  async emitEvent(sessionId: string, event: { type: string; [key: string]: unknown }): Promise<SessionEvent> {
    await this.#ensureSessionDir(sessionId);
    const events = await readJsonLines<SessionEvent>(this.#eventsFile(sessionId));
    const nextSeq = events.length === 0 ? 1 : Math.max(...events.map((row) => row.seq ?? 0)) + 1;
    const stored: SessionEvent = {
      ...event,
      version: 1,
      seq: nextSeq,
      ts: nowIso(),
      sessionId,
      type: event.type,
    };
    await appendJsonLine(this.#eventsFile(sessionId), stored);
    await this.touchSession(sessionId, stored.ts);
    return stored;
  }

  async getEvents(sessionId: string, query: { type?: string | string[]; fromSeq?: number; toSeq?: number } = {}): Promise<SessionEvent[]> {
    const events = await readJsonLines<SessionEvent>(this.#eventsFile(sessionId));
    const allowedTypes = Array.isArray(query.type)
      ? new Set(query.type)
      : query.type ? new Set([query.type]) : null;

    return events.filter((event) => {
      if (allowedTypes && !allowedTypes.has(event.type)) return false;
      if (query.fromSeq !== undefined && (event.seq ?? 0) < query.fromSeq) return false;
      if (query.toSeq !== undefined && (event.seq ?? 0) > query.toSeq) return false;
      return true;
    });
  }

  async appendStatePatch(sessionId: string, patch: Record<string, unknown>): Promise<{ version: number; seq: number; ts: string; sessionId: string; patch: Record<string, unknown> }> {
    if (!isPlainObject(patch)) {
      throw new Error('state patch must be an object');
    }

    await this.#ensureSessionDir(sessionId);
    const patches = await readJsonLines<{ seq: number; patch: Record<string, unknown> }>(this.#statePatchesFile(sessionId));
    const storedPatch = {
      version: 1,
      seq: patches.length === 0 ? 1 : Math.max(...patches.map((row) => row.seq ?? 0)) + 1,
      ts: nowIso(),
      sessionId,
      patch,
    };
    await appendJsonLine(this.#statePatchesFile(sessionId), storedPatch);
    await this.touchSession(sessionId, storedPatch.ts);
    return storedPatch;
  }

  async getLatestState(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.getSession(sessionId);
    const patches = await readJsonLines<Record<string, { seq: number; patch: Record<string, unknown> }>>(this.#statePatchesFile(sessionId));
    const events = await this.getEvents(sessionId);
    const stateFromPatches = patches.reduce(
      (state, item) => deepMerge(state, item.patch ?? {}),
      {} as Record<string, unknown>,
    );

    const actors: Record<string, string> = {};
    for (const event of events) {
      const actor = event.actor ?? event.payload?.actor;
      if (!actor) continue;
      if (event.type === 'actor.dispatched') actors[String(actor)] = 'dispatched';
      if (event.type === 'actor.completed') actors[String(actor)] = 'completed';
      if (event.type === 'actor.blocked') actors[String(actor)] = 'blocked';
    }

    const lastEvent = events.at(-1) ?? null;
    return deepMerge({
      version: 1,
      sessionId,
      task: session.task,
      routeId: session.routeId,
      workspaceRoot: session.workspaceRoot,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      eventCount: events.length,
      lastSeq: lastEvent?.seq ?? 0,
      lastEventType: lastEvent?.type ?? null,
      completed: events.some((event) => event.type === 'session.completed'),
      actors,
    } as Record<string, unknown>, stateFromPatches);
  }

  async touchSession(sessionId: string, updatedAt: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      await writeJson(this.#sessionFile(sessionId), { ...session, updatedAt });
    } catch {
      // session file may not exist yet during early initialization
    }
  }
}

export async function createSession(options: { workspaceRoot: string; task: string; routeId?: string | null }): Promise<SessionRecord> {
  return new SessionStore({ workspaceRoot: options.workspaceRoot }).createSession({
    task: options.task,
    routeId: options.routeId,
    workspaceRoot: options.workspaceRoot,
  });
}
