function getTargetPath(input = {}) {
  return input.file_path || input.path || '';
}

function normalizeWithoutPasses(source = '') {
  return source
    .replace(/"passes"\s*:\s*(true|false)/g, '"passes": __PLACEHOLDER__')
    .replace(/\s+/g, ' ')
    .trim();
}

export default {
  name: 'features-json-guard',
  description: 'Prevent managed-agent execution flows from mutating features.json beyond the passes field.',
  match: ['Edit', 'Write'],
  handler: async ({ input, toolName }) => {
    try {
      const targetPath = getTargetPath(input);
      if (!targetPath || !targetPath.includes('features.json')) {
        return { continue: true, suppressOutput: true };
      }

      if (toolName === 'Write') {
        try {
          await Deno.stat(targetPath);
          const message = [
            'features.json immutability violation: full overwrite blocked.',
            'In the managed-agents architecture, feature-planner owns the contract shape.',
            'Execution-manager, capability agents, and probe agents may only update the "passes" field via Edit.',
            'To change feature definitions, route the request back through planning or the inbox gate.'
          ].join('\n');

          console.error(JSON.stringify({
            event: 'features_json_write_blocked',
            file: targetPath
          }));

          return { continue: false, output: message };
        } catch {
          return { continue: true, suppressOutput: true };
        }
      }

      const oldStr = input.old_string || '';
      const newStr = input.new_string || '';
      if (!oldStr && !newStr) {
        return { continue: true, suppressOutput: true };
      }

      const oldNormalized = normalizeWithoutPasses(oldStr);
      const newNormalized = normalizeWithoutPasses(newStr);
      if (oldNormalized === newNormalized) {
        return { continue: true, suppressOutput: true };
      }

      const message = [
        'features.json immutability violation detected.',
        'Only the "passes" field may change after feature-planner creates the file.',
        'All other fields remain the planning contract for managers, hands, and probes.',
        'Recovery: restore features.json from git or re-run feature-planner through the proper route.'
      ].join('\n');

      console.error(JSON.stringify({
        event: 'features_json_violation',
        file: targetPath
      }));

      return { continue: false, output: message };
    } catch (error) {
      console.error('features-json-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};
