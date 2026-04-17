function getTargetPath(input = {}) {
  return input.file_path || input.path || '';
}

function getNewContent(input = {}, toolName = '') {
  if (toolName === 'Write') return input.content || '';
  return input.new_string || '';
}

function workspaceRoot(targetPath) {
  const idx = targetPath.lastIndexOf('/.agent-memory/');
  return idx >= 0 ? targetPath.slice(0, idx) : '';
}

async function readJson(path) {
  const raw = await Deno.readTextFile(path);
  return JSON.parse(raw);
}

export default {
  name: 'probe-evidence-guard',
  description: 'Require acceptance reports to cite probe-produced evidence when the route or contract requires probes.',
  match: ['Edit', 'Write'],
  handler: async ({ input, toolName }) => {
    try {
      const targetPath = getTargetPath(input);
      if (!targetPath || !targetPath.includes('/.agent-memory/acceptance-report.md')) {
        return { continue: true, suppressOutput: true };
      }

      const root = workspaceRoot(targetPath);
      if (!root) {
        return { continue: true, suppressOutput: true };
      }

      const indexPath = `${root}/.agent-memory/managed-agent-state-index.json`;
      let index;
      try {
        index = await readJson(indexPath);
      } catch {
        return { continue: true, suppressOutput: true };
      }

      const required = index?.probe_requirements?.current || {};
      const needsProbe = Boolean(required.ui || required.api || required.regression || required.artifact);
      if (!needsProbe) {
        return { continue: true, suppressOutput: true };
      }

      const ledgerPath = `${root}/.agent-memory/evidence-ledger.md`;
      let ledgerText = '';
      try {
        ledgerText = await Deno.readTextFile(ledgerPath);
      } catch {
        ledgerText = '';
      }

      const acceptedProbeProducers = index?.acceptance?.accepted_probe_producers || [
        'ui-probe-agent',
        'api-probe-agent',
        'regression-probe-agent',
        'artifact-probe-agent'
      ];

      const probeEvidenceFoundInLedger = acceptedProbeProducers.some((producer) => ledgerText.includes(producer));
      const newContent = getNewContent(input, toolName);
      const hasEvidencePath = /evidence\/[^\s)]+/.test(newContent);
      const citesProbeProducer = acceptedProbeProducers.some((producer) => newContent.includes(producer));

      if (probeEvidenceFoundInLedger && hasEvidencePath && citesProbeProducer) {
        return { continue: true, suppressOutput: true };
      }

      const needed = Object.entries(required)
        .filter(([key, value]) => key !== 'reason' && value)
        .map(([key]) => key)
        .join(', ');

      const message = [
        'Probe evidence guard blocked this acceptance report write.',
        `Required probes: ${needed || 'unknown'}`,
        'When probes are required, acceptance-report.md must cite probe-produced evidence paths and name the probe producer used.',
        'Recovery:',
        '1. Ensure evidence-ledger.md includes entries from the required probe agent(s).',
        '2. Reference the probe agent name and the concrete evidence/... path inside acceptance-report.md.'
      ].join('\n');

      console.error(JSON.stringify({
        event: 'probe_evidence_guard_blocked',
        file: targetPath,
        required_probes: required,
        probe_evidence_found_in_ledger: probeEvidenceFoundInLedger,
        has_evidence_path: hasEvidencePath,
        cites_probe_producer: citesProbeProducer
      }));

      return { continue: false, output: message };
    } catch (error) {
      console.error('probe-evidence-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};
