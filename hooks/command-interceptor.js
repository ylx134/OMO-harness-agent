/**
 * Command Interceptor — standalone hook for /control /plan /drive /check
 *
 * Spawns scripts/harness-intake.mjs via Node.js to run plugin intake.
 * Plugin server hooks are correctly registered but not called by the
 * OpenCode runtime, so this standalone hook bridges the gap.
 */
export default {
  name: "command-interceptor",
  description: "Intercept harness commands and trigger plugin intake via Node.js",
  match: ["command.execute.before"],

  handler: async ({ input }) => {
    try {
      const raw = String(input?.command || '').replace(/^\//, '').trim();
      if (!['control', 'plan', 'drive', 'check'].includes(raw)) {
        return { continue: true, suppressOutput: true };
      }

      const message = input?.arguments || '';

      const workspace = Deno.env.get('WORKSPACE_ROOT')
        || Deno.env.get('OPENAICODE_PROJECT_DIR')
        || Deno.env.get('PWD')
        || '';

      if (!workspace) {
        return { continue: true, suppressOutput: true };
      }

      const repoDir = Deno.env.get('HARNESS_REPO_DIR')
        || `${Deno.env.get('HOME')}/Documents/my_workspace/omo-harness-skills`;

      const scriptPath = `${repoDir}/scripts/harness-intake.mjs`;

      const cmd = new Deno.Command('node', {
        args: [scriptPath, workspace, raw, message],
        stdout: 'null',
        stderr: 'null',
      });
      cmd.spawn();

      return { continue: true, suppressOutput: true };
    } catch (error) {
      console.error('command-interceptor error:', error?.message || String(error));
      return { continue: true, suppressOutput: true };
    }
  },
};
