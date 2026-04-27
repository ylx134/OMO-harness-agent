// @ts-nocheck
import type { StandardSignalEvent } from '../types.js';

const SIGNAL_LIMIT = 200;

function nowIso() {
  return new Date().toISOString();
}

function asArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function parseJsonPayload(raw = '') {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { summary: String(parsed) };
  } catch {
    return { summary: raw.trim() };
  }
}

function parseSignalLines(message = '', marker = '') {
  const events = [];
  const prefix = `${marker} `;
  for (const line of String(message || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix)) continue;
    events.push(parseJsonPayload(trimmed.slice(prefix.length).trim()));
  }
  return events;
}

function normalizeEvent(kind, payload, context): StandardSignalEvent {
  const summary = String(payload?.summary || payload?.message || payload?.status || `${kind} from ${context.actor}`).trim();
  return {
    schemaVersion: 1,
    kind,
    requestId: context.state?.requestId || '',
    routeId: context.state?.routeId || '',
    actor: context.actor || '',
    stepId: context.stepId || '',
    phase: context.phase || '',
    sessionID: context.sessionID || '',
    at: context.at || nowIso(),
    status: payload?.status ? String(payload.status) : undefined,
    summary,
    detail: payload?.detail ? String(payload.detail) : undefined,
    to: payload?.to ? String(payload.to) : undefined,
    artifacts: asArray(payload?.artifacts),
    blockers: asArray(payload?.blockers),
    nextActions: asArray(payload?.nextActions || payload?.next_actions),
    raw: payload,
  };
}

function appendLimited(events = [], nextEvents = []) {
  return [...(events || []), ...(nextEvents || [])].slice(-SIGNAL_LIMIT);
}

export function parseStandardSignalEvents(message = '', context = {}) {
  const progress = parseSignalLines(message, 'HARNESS_PROGRESS')
    .map((payload) => normalizeEvent('progress-signal', payload, context));
  const handoff = parseSignalLines(message, 'HARNESS_HANDOFF')
    .map((payload) => normalizeEvent('handoff-signal', payload, context));
  const completion = parseSignalLines(message, 'HARNESS_COMPLETE')
    .map((payload) => normalizeEvent('completion-signal', payload, context));

  return {
    progress,
    handoff,
    completion,
    hasSignals: progress.length + handoff.length + completion.length > 0,
    hasCompletion: completion.length > 0,
  };
}

export function applyStandardSignalEvents(state, parsed) {
  const nextProgress = appendLimited(state?.progressSignals, parsed.progress || []);
  const nextHandoff = appendLimited(state?.handoffSignals, parsed.handoff || []);
  const nextCompletion = appendLimited(state?.completionSignals, parsed.completion || []);

  return {
    ...state,
    progressSignals: nextProgress,
    handoffSignals: nextHandoff,
    completionSignals: nextCompletion,
    latestProgressSignal: nextProgress[nextProgress.length - 1] || state?.latestProgressSignal || null,
    latestHandoffSignal: nextHandoff[nextHandoff.length - 1] || state?.latestHandoffSignal || null,
    latestCompletionSignal: nextCompletion[nextCompletion.length - 1] || state?.latestCompletionSignal || null,
  };
}
