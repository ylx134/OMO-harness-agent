// @ts-nocheck
import { TERMINAL_STEP_STATUSES } from '../state/schema.js';
function dedupe(values = []) {
    return Array.from(new Set((values || []).filter(Boolean)));
}
function activeStatuses() {
    return new Set(['dispatching', 'in_progress', 'waiting']);
}
function pendingLikeStatuses() {
    return new Set(['pending', 'ready', 'blocked', 'retryable_error']);
}
export function normalizeSignals(graph, signals = {}) {
    const normalized = {};
    const names = new Set();
    for (const step of Object.values(graph?.steps || {})) {
        for (const signalName of step?.dependsOnSignals || [])
            names.add(signalName);
        for (const signalName of step?.emitsSignals || [])
            names.add(signalName);
    }
    for (const signalName of Object.keys(signals || {}))
        names.add(signalName);
    for (const signalName of names) {
        const current = signals?.[signalName] || {};
        normalized[signalName] = {
            emitted: Boolean(current.emitted),
            emittedAt: current.emittedAt || null,
            emittedByStepId: current.emittedByStepId || null,
            payloadRef: current.payloadRef || null,
        };
    }
    return normalized;
}
function stepDependenciesSatisfied(stepRuntime, dependsOnStepIds = []) {
    return dependsOnStepIds.every((dependencyStepId) => TERMINAL_STEP_STATUSES.has(stepRuntime?.[dependencyStepId]?.status || 'pending'));
}
function signalDependenciesSatisfied(signals, dependsOnSignals = []) {
    return dependsOnSignals.every((signalName) => Boolean(signals?.[signalName]?.emitted));
}
export function deriveSignalSchedulingState(graph, stepRuntime, signals) {
    const readyStepIds = [];
    const blockedStepIds = [];
    for (const [stepId, step] of Object.entries(graph?.steps || {})) {
        const status = stepRuntime?.[stepId]?.status || 'pending';
        if (TERMINAL_STEP_STATUSES.has(status) || activeStatuses().has(status))
            continue;
        if (!pendingLikeStatuses().has(status))
            continue;
        const stepDepsSatisfied = stepDependenciesSatisfied(stepRuntime, step.dependsOnStepIds || []);
        if (!stepDepsSatisfied)
            continue;
        const signalDepsSatisfied = signalDependenciesSatisfied(signals, step.dependsOnSignals || []);
        if (signalDepsSatisfied) {
            readyStepIds.push(stepId);
        }
        else if ((step.dependsOnSignals || []).length > 0) {
            blockedStepIds.push(stepId);
        }
    }
    return {
        readyStepIds: dedupe(readyStepIds),
        blockedStepIds: dedupe(blockedStepIds),
    };
}
export function emitSignalsForStep(graph, signals, stepId, emittedAt, payloadRef = null) {
    const normalizedSignals = normalizeSignals(graph, signals);
    const step = graph?.steps?.[stepId];
    for (const signalName of step?.emitsSignals || []) {
        normalizedSignals[signalName] = {
            emitted: true,
            emittedAt: normalizedSignals[signalName]?.emittedAt || emittedAt,
            emittedByStepId: normalizedSignals[signalName]?.emittedByStepId || stepId,
            payloadRef: normalizedSignals[signalName]?.payloadRef || payloadRef,
        };
    }
    return normalizedSignals;
}
