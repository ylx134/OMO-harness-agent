/**
 * Require Subagent Dispatch Hook
 *
 * When harness-orchestrator is about to respond directly (doing work itself
 * instead of dispatching managers/hands/probes), this hook intercepts and
 * redirects. It bridges the gap while plugin server hooks are not being
 * called by the OpenCode runtime.
 */
export default {
  name: "require-subagent-dispatch",
  description: "Block harness-orchestrator direct responses when route is active",
  match: ["chat.message"],

  handler: async ({ input, output }) => {
    try {
      const agent = input?.agent || Deno.env.get('OMO_ACTIVE_SKILL') || Deno.env.get('AGENT_ROLE') || '';
      const isOrchestrator = agent.includes('harness-orchestrator') || agent === 'harness-orchestrator';

      if (!isOrchestrator) {
        return { continue: true, suppressOutput: true };
      }

      // Find workspace from session directory
      const workspace = Deno.env.get('WORKSPACE_ROOT')
        || Deno.env.get('OPENAICODE_PROJECT_DIR')
        || Deno.env.get('PWD')
        || '';

      if (!workspace) {
        return { continue: true, suppressOutput: true };
      }

      // Check if harness state exists
      const statePath = `${workspace}/.agent-memory/harness-plugin-state.json`;
      let state = null;
      try {
        state = JSON.parse(await Deno.readTextFile(statePath));
      } catch {
        return { continue: true, suppressOutput: true };
      }

      if (!state || state.mode !== 'harness') {
        return { continue: true, suppressOutput: true };
      }

      // If blocked, don't interfere — orchestrator needs to ask questions
      if (state.blocked) {
        return { continue: true, suppressOutput: true };
      }

      // If intake phase: orchestrator should NOT be doing work
      if (state.currentPhase === 'intake') {
        output.parts = [{
          type: 'text',
          text: `Harness intake initialized for ${state.routeId}. Next expected actor: ${state.nextExpectedActor}. Route packet written to .agent-memory/route-packet.json. Dispatch ${state.nextExpectedActor} now.`
        }];
        return;
      }

      return { continue: true, suppressOutput: true };
    } catch (error) {
      console.error('require-subagent-dispatch error:', error?.message);
      return { continue: true, suppressOutput: true };
    }
  },
};
