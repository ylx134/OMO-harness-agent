// @ts-nocheck
import { projectLegacyState } from '../state/legacy-projection.js';
function normalizeList(values) {
    return Array.isArray(values) ? values.filter(Boolean) : [];
}
function formatList(values) {
    const normalized = normalizeList(values);
    return normalized.length ? normalized.join(', ') : 'none';
}
function formatLocks(heldLocks = {}) {
    const entries = Object.entries(heldLocks || {});
    return entries.length
        ? entries.map(([lockName, stepId]) => `${lockName}=${stepId}`).join(', ')
        : 'none';
}
function summarizeSignals(signals = {}) {
    const names = Object.keys(signals || {});
    const emittedSignalNames = names.filter((signalName) => Boolean(signals?.[signalName]?.emitted));
    const pendingSignalNames = names.filter((signalName) => !signals?.[signalName]?.emitted);
    return {
        total: names.length,
        emitted: emittedSignalNames.length,
        pending: pendingSignalNames.length,
        emittedSignalNames,
        pendingSignalNames,
    };
}
function legacyCompatFromState(state) {
    const projected = projectLegacyState(state || {});
    return {
        activeDispatch: projected.activeDispatch ?? state?.activeDispatch ?? state?.compat?.activeDispatch ?? null,
        pendingManagers: projected.pendingManagers ?? state?.pendingManagers ?? state?.compat?.pendingManagers ?? [],
        pendingCapabilityHands: projected.pendingCapabilityHands ?? state?.pendingCapabilityHands ?? state?.compat?.pendingCapabilityHands ?? [],
        pendingProbes: projected.pendingProbes ?? state?.pendingProbes ?? state?.compat?.pendingProbes ?? [],
        nextExpectedActor: projected.nextExpectedActor ?? state?.nextExpectedActor ?? state?.compat?.nextExpectedActor ?? 'none',
        deferredDispatchState: projected.deferredDispatchState ?? state?.deferredDispatchState ?? state?.compat?.deferredDispatchState ?? 'ready',
        childDispatchSessionIDs: state?.compat?.childDispatchSessionIDs ?? state?.childDispatchSessionIDs ?? projected.childDispatchSessionIDs ?? null,
    };
}
export function buildRoutePacketProjection(routeId, route, state) {
    const completedDeliverables = normalizeList(state?.completedDeliverables);
    const missingDeliverables = normalizeList(route?.deliverables).filter((name) => !completedDeliverables.includes(name));
    const legacyCompat = legacyCompatFromState(state);
    const signalSummary = summarizeSignals(state?.signals || {});
    return {
        routeId,
        taskType: route.taskType,
        flowTier: route.flowTier,
        semanticLockStatus: state?.semanticLockStatus || 'locked',
        semanticLockText: state?.semanticLockText || '',
        reasonForLane: route.description,
        routingContractRow: `${routeId} | ${route.taskType} | ${route.flowTier} | managers=${route.managers.join(' -> ')}`,
        resolvedSkillStack: Array.from(new Set([...(route.managers || []), ...(state?.selectedCapabilityHands || []), ...(state?.selectedProbes || [])].filter(Boolean))),
        defaultMainRoute: routeId,
        requiredStartupFiles: route.startupFiles,
        requiredPlanningFiles: route.startupFiles.filter((name) => ['task.md', 'baseline-source.md', 'capability-map.md', 'gap-analysis.md', 'quality-guardrails.md', 'product-spec.md', 'features.json', 'features-summary.md', 'working-memory.md'].includes(name)).filter((name, index, values) => values.indexOf(name) === index),
        requiredExecutionFiles: route.deliverables.filter((name) => ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'task.md', 'features.json', 'features-summary.md', 'product-spec.md', 'baseline-source.md', 'capability-map.md', 'gap-analysis.md'].includes(name)).filter((name, index, values) => values.indexOf(name) === index),
        requiredAcceptanceGates: Array.from(new Set([...(state?.selectedProbes || route.probes || []), 'acceptance-report.md', route.antiShallowBar].filter(Boolean))),
        requiredDeliverables: route.deliverables,
        missingDeliverables,
        routeBlockingGaps: state?.blocked ? [state.blockedReason || 'blocked'] : [],
        pendingManagers: legacyCompat.pendingManagers,
        pendingCapabilityHands: legacyCompat.pendingCapabilityHands,
        pendingProbes: legacyCompat.pendingProbes,
        deferredDispatchState: legacyCompat.deferredDispatchState || 'ready',
        lastCompletedActor: state?.lastCompletedActor || 'none',
        category: route.category,
        antiShallowBar: route.antiShallowBar,
        activeStepIds: normalizeList(state?.activeStepIds),
        readyStepIds: normalizeList(state?.readyStepIds),
        blockedStepIds: normalizeList(state?.blockedStepIds),
        heldLocks: { ...(state?.heldLocks || {}) },
        signalSummary,
        legacyCompat,
    };
}
export function buildManagedAgentIndexProjection(state, options = {}) {
    const legacyCompat = legacyCompatFromState(state);
    const signalSummary = summarizeSignals(state?.signals || {});
    return {
        version: 2,
        mode: 'managed-agents',
        last_updated: options.lastUpdated || new Date().toISOString(),
        route: {
            request_id: state.requestId,
            route_id: state.routeId,
            task_type: state.taskType,
            flow_tier: state.flowTier,
            semantic_lock_status: state.semanticLockStatus || 'locked',
            semantic_lock_text: state.semanticLockText || '',
            current_phase: state.currentPhase,
            next_expected_actor: legacyCompat.nextExpectedActor,
            blocked: Boolean(state.blocked),
            blocked_reason: state.blockedReason || '',
        },
        required_manager_dispatch: state.requiredManagers,
        pending_manager_dispatch: legacyCompat.pendingManagers,
        dispatched_managers: state.dispatchedManagers,
        required_capability_hands: state.requiredCapabilityHands,
        selected_capability_hands: state.selectedCapabilityHands || state.requiredCapabilityHands,
        pending_capability_hands: legacyCompat.pendingCapabilityHands,
        dispatched_capability_hands: state.dispatchedCapabilityHands,
        required_probes: state.requiredProbes,
        selected_probes: state.selectedProbes || state.requiredProbes,
        pending_probes: legacyCompat.pendingProbes,
        dispatched_probes: state.dispatchedProbes,
        deferred_dispatch_state: legacyCompat.deferredDispatchState || 'ready',
        last_completed_actor: state.lastCompletedActor || 'none',
        graph_runtime: {
            active_step_ids: normalizeList(state?.activeStepIds),
            ready_step_ids: normalizeList(state?.readyStepIds),
            blocked_step_ids: normalizeList(state?.blockedStepIds),
            held_locks: { ...(state?.heldLocks || {}) },
            signal_summary: {
                total: signalSummary.total,
                emitted: signalSummary.emitted,
                pending: signalSummary.pending,
                emitted_signal_names: signalSummary.emittedSignalNames,
                pending_signal_names: signalSummary.pendingSignalNames,
            },
        },
        legacy_compat: {
            next_expected_actor: legacyCompat.nextExpectedActor,
            deferred_dispatch_state: legacyCompat.deferredDispatchState,
            pending_managers: legacyCompat.pendingManagers,
            pending_capability_hands: legacyCompat.pendingCapabilityHands,
            pending_probes: legacyCompat.pendingProbes,
            active_dispatch: legacyCompat.activeDispatch,
        },
        probe_requirements: {
            default: {},
            current: {
                ui: Boolean((state.requiredProbes || []).includes('ui-probe-agent')),
                api: Boolean((state.requiredProbes || []).includes('api-probe-agent')),
                regression: Boolean((state.requiredProbes || []).includes('regression-probe-agent')),
                artifact: Boolean((state.requiredProbes || []).includes('artifact-probe-agent')),
                reason: 'harness plugin route requirements',
            },
        },
        acceptance: {
            accepted_probe_producers: ['ui-probe-agent', 'api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
        },
    };
}
export function buildStatusProjection(state, routePacket) {
    const legacyCompat = routePacket?.legacyCompat || legacyCompatFromState(state);
    const signalSummary = routePacket?.signalSummary || summarizeSignals(state?.signals || {});
    const activeDispatch = legacyCompat.activeDispatch
        ? `${legacyCompat.activeDispatch.actor} (${legacyCompat.activeDispatch.phase || 'unknown'}) session=${legacyCompat.activeDispatch.sessionID || 'none'}`
        : 'none';
    return [
        '# Orchestration Status', '',
        `- Mode: ${state.mode}`,
        `- Request ID: ${state.requestId}`,
        `- Route: ${state.routeId}`,
        `- Task Type: ${state.taskType}`,
        `- Flow Tier: ${state.flowTier}`,
        `- Semantic Lock Status: ${state.semanticLockStatus || 'locked'}`,
        `- Semantic Lock Text: ${state.semanticLockText || 'none'}`,
        `- Current Phase: ${state.currentPhase}`,
        `- Expected Next Writer: ${legacyCompat.nextExpectedActor}`,
        `- Reason for Lane: ${routePacket.reasonForLane}`,
        `- Routing Contract Row: ${routePacket.routingContractRow}`,
        `- Resolved Skill Stack: ${formatList(routePacket.resolvedSkillStack)}`,
        `- Default Main Route: ${routePacket.defaultMainRoute}`,
        `- Required Startup Files: ${formatList(routePacket.requiredStartupFiles)}`,
        `- Required Planning Files: ${formatList(routePacket.requiredPlanningFiles)}`,
        `- Required Execution Files: ${formatList(routePacket.requiredExecutionFiles)}`,
        `- Required Acceptance Gates: ${formatList(routePacket.requiredAcceptanceGates)}`,
        `- Dispatched Managers: ${formatList(state.dispatchedManagers)}`,
        `- Selected Capability Hands: ${formatList(state.selectedCapabilityHands)}`,
        `- Dispatched Capability Hands: ${formatList(state.dispatchedCapabilityHands)}`,
        `- Selected Probes: ${formatList(state.selectedProbes)}`,
        `- Dispatched Probes: ${formatList(state.dispatchedProbes)}`,
        `- Required Deliverables: ${formatList(routePacket.requiredDeliverables)}`,
        `- Missing Deliverables: ${formatList(routePacket.missingDeliverables)}`,
        `- Route Blocking Gaps: ${formatList(routePacket.routeBlockingGaps)}`,
        `- Blocked: ${Boolean(state.blocked)}`,
        `- Blocked Reason: ${state.blockedReason || 'none'}`,
        '',
        '## Graph Runtime Summary',
        `- Active Step IDs: ${formatList(routePacket.activeStepIds)}`,
        `- Ready Step IDs: ${formatList(routePacket.readyStepIds)}`,
        `- Blocked Step IDs: ${formatList(routePacket.blockedStepIds)}`,
        `- Held Locks: ${formatLocks(routePacket.heldLocks)}`,
        `- Signal Summary: ${signalSummary.emitted} emitted, ${signalSummary.pending} pending`,
        `- Emitted Signals: ${formatList(signalSummary.emittedSignalNames)}`,
        `- Pending Signals: ${formatList(signalSummary.pendingSignalNames)}`,
        '',
        '## Legacy Compatibility View',
        `- Legacy Pending Managers: ${formatList(legacyCompat.pendingManagers)}`,
        `- Legacy Pending Capability Hands: ${formatList(legacyCompat.pendingCapabilityHands)}`,
        `- Legacy Pending Probes: ${formatList(legacyCompat.pendingProbes)}`,
        `- Legacy Deferred Dispatch State: ${legacyCompat.deferredDispatchState || 'ready'}`,
        `- Legacy Active Dispatch: ${activeDispatch}`,
    ].join('\n') + '\n';
}
