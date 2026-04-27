// @ts-nocheck

import { recoverGraphRuntimeState } from './recovery.js';
import { selectNextDispatchPlan } from './scheduler.js';
import { reconcileActiveDispatchTransition } from './transitions.js';
import { lazyProvisionIfNeeded } from './lazy-provision.js';

function shouldAutoAdvance(state, options) {
  if (options.forceDispatch) return true;
  return Boolean(
    state?.autopilotEnabled
      && !state?.activeDispatch
      && state?.deferredDispatchState !== 'retryable_error'
      && state?.currentPhase !== 'complete',
  );
}

export async function reconcileRuntime(context) {
  const {
    workspace,
    state,
    source,
    appendPluginDebug,
    dispatchNextDeferredManager,
    dispatchNextDeferredHand,
    dispatchNextDeferredProbe,
    finalizeDeferredAcceptance,
    options = {},
  } = context;

  await appendPluginDebug(workspace, 'reconcile.runtime.started', {
    source,
    activeDispatch: state?.activeDispatch || null,
    currentPhase: state?.currentPhase || '',
    deferredDispatchState: state?.deferredDispatchState || '',
  });

  let nextState = recoverGraphRuntimeState(state);

  // ── Lazy Provision (#4): select hands/probes when needed ──
  const patches = lazyProvisionIfNeeded(nextState);
  if (patches) {
    nextState = { ...nextState, ...patches };
    nextState = recoverGraphRuntimeState(nextState);
    await appendPluginDebug(workspace, 'lazy.provision.applied', {
      handsSelected: Boolean(patches.selectedCapabilityHands?.length),
      probesSelected: Boolean(patches.selectedProbes?.length),
    });
  }
  // ── End Lazy Provision ────────────────────────────────────

  let transition = { kind: 'none', reason: 'no_transition_requested' };

  if (options.completeActiveDispatch) {
    const transitionResult = await reconcileActiveDispatchTransition(context);
    nextState = transitionResult.state;
    transition = transitionResult.transition;
  }

  let dispatchPlan = { dispatches: [], reason: 'dispatch_not_attempted' };
  if (shouldAutoAdvance(nextState, options)) {
    dispatchPlan = selectNextDispatchPlan(nextState, options);
    if (dispatchPlan.dispatches.length === 0 && dispatchPlan.reason === 'active_dispatch_in_progress') {
      await appendPluginDebug(workspace, 'deferred.dispatch.duplicate_skipped', {
        routeId: nextState.routeId,
        requestId: nextState.requestId,
        activeDispatch: nextState.activeDispatch,
        reason: 'awaiting_child_completion',
      });
    }
    for (const dispatch of dispatchPlan.dispatches) {
      if (dispatch.kind === 'manager') {
        nextState = await dispatchNextDeferredManager(context.client, workspace, nextState, dispatch.actor);
      } else if (dispatch.kind === 'capability-hand') {
        nextState = await dispatchNextDeferredHand(context.client, workspace, nextState, dispatch.actor);
      } else if (dispatch.kind === 'probe') {
        nextState = await dispatchNextDeferredProbe(context.client, workspace, nextState, dispatch.actor);
      } else if (dispatch.kind === 'acceptance-closure') {
        nextState = await finalizeDeferredAcceptance(context.client, workspace, nextState, dispatch.actor);
      }

      nextState = recoverGraphRuntimeState(nextState);
      if (nextState?.deferredDispatchState === 'retryable_error') break;
    }
  }

  await appendPluginDebug(workspace, 'reconcile.runtime.completed', {
    source,
    transition,
    dispatch: dispatchPlan,
    activeDispatch: nextState?.activeDispatch || null,
    currentPhase: nextState?.currentPhase || '',
    deferredDispatchState: nextState?.deferredDispatchState || '',
  });

  return recoverGraphRuntimeState(nextState);
}
