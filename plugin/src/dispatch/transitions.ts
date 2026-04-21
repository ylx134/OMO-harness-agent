// @ts-nocheck

export async function reconcileActiveDispatchTransition(context) {
  const {
    workspace,
    state,
    options = {},
    completeDeferredManager,
    completeDeferredCapabilityHand,
    completeDeferredProbe,
    completeDeferredAcceptanceClosure,
  } = context;

  const stepId = options.completeStepId || state?.activeDispatch?.stepId || null;
  const actor = options.completeActor || state?.graph?.steps?.[stepId]?.actor || state?.activeDispatch?.actor || null;
  const phase = options.completePhase || state?.graph?.steps?.[stepId]?.kind || state?.activeDispatch?.phase || null;

  if (!stepId || !actor || !phase) {
    return { state, transition: { kind: 'none', reason: 'no_active_dispatch' } };
  }

  if (phase === 'manager') {
    const nextState = await completeDeferredManager(workspace, state, actor, options.completionSource);
    return { state: nextState, transition: { kind: 'manager-completed', actor } };
  }

  if (phase === 'capability-hand') {
    const nextState = await completeDeferredCapabilityHand(workspace, state, actor, options.completionSource);
    return { state: nextState, transition: { kind: 'capability-hand-completed', actor } };
  }

  if (phase === 'probe') {
    const nextState = await completeDeferredProbe(workspace, state, actor, options.completionSource);
    return { state: nextState, transition: { kind: 'probe-completed', actor } };
  }

  if (phase === 'acceptance-closure') {
    const nextState = await completeDeferredAcceptanceClosure(workspace, state, options.completionSource);
    return { state: nextState, transition: { kind: 'acceptance-closure-completed', actor: 'acceptance-manager' } };
  }

  return { state, transition: { kind: 'none', reason: 'unsupported_phase' } };
}
