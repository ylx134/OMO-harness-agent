function getTargetPath(input = {}) {
  return input.file_path || input.path || '';
}

function workspaceRoot(targetPath) {
  const idx = targetPath.lastIndexOf('/.agent-memory/');
  return idx >= 0 ? targetPath.slice(0, idx) : '';
}

async function readText(path) {
  return await Deno.readTextFile(path);
}

function hasAnyMarker(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

export default {
  name: 'managed-route-completeness-guard',
  description: 'Block harness completions when manager/hand/probe participation markers are missing.',
  match: ['Edit', 'Write'],
  handler: async ({ input }) => {
    try {
      const targetPath = getTargetPath(input);
      if (!targetPath || !targetPath.includes('/.agent-memory/acceptance-report.md')) {
        return { continue: true, suppressOutput: true };
      }

      const root = workspaceRoot(targetPath);
      if (!root) return { continue: true, suppressOutput: true };

      const statusPath = `${root}/.agent-memory/orchestration-status.md`;
      const executionPath = `${root}/.agent-memory/execution-status.md`;
      const ledgerPath = `${root}/.agent-memory/evidence-ledger.md`;

      let statusText = '';
      let executionText = '';
      let ledgerText = '';
      try { statusText = await readText(statusPath); } catch {}
      try { executionText = await readText(executionPath); } catch {}
      try { ledgerText = await readText(ledgerPath); } catch {}

      const isHarnessManaged = /Route:|Task Type:|Flow Tier:/m.test(statusText);
      if (!isHarnessManaged) {
        return { continue: true, suppressOutput: true };
      }

      const managerChecks = {
        planning: hasAnyMarker(statusText + executionText, ['planning-manager', 'plan']),
        execution: hasAnyMarker(statusText + executionText, ['execution-manager', 'drive']),
        acceptance: hasAnyMarker(statusText, ['acceptance-manager', 'check'])
      };

      const handMarkers = ['browser-agent', 'code-agent', 'shell-agent', 'docs-agent', 'evidence-agent'];
      const probeMarkers = ['ui-probe-agent', 'api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'];

      const hasHand = hasAnyMarker(executionText + ledgerText, handMarkers);
      const hasProbe = hasAnyMarker(ledgerText + (input.content || '') + (input.new_string || ''), probeMarkers);

      const missingManagers = Object.entries(managerChecks)
        .filter(([, present]) => !present)
        .map(([name]) => name);

      if (missingManagers.length === 0 && hasHand && hasProbe) {
        return { continue: true, suppressOutput: true };
      }

      const message = [
        'Managed-route completeness guard blocked this acceptance report write.',
        missingManagers.length ? `Missing manager participation markers: ${missingManagers.join(', ')}` : 'All manager markers present.',
        `Capability hand participation found: ${hasHand}`,
        `Probe participation found: ${hasProbe}`,
        'Harness mode does not allow completion without explicit plan/drive/check manager participation, at least one capability hand, and at least one probe.',
        'Recovery:',
        '1. Ensure orchestration-status.md records planning-manager / execution-manager / acceptance-manager participation.',
        '2. Ensure execution-status.md or evidence-ledger.md names at least one capability agent.',
        '3. Ensure evidence-ledger.md and acceptance-report.md cite at least one probe agent.'
      ].join('\n');

      console.error(JSON.stringify({
        event: 'managed_route_completeness_guard_blocked',
        file: targetPath,
        missing_managers: missingManagers,
        has_hand: hasHand,
        has_probe: hasProbe
      }));

      return { continue: false, output: message };
    } catch (error) {
      console.error('managed-route-completeness-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};
