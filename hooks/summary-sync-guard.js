const SUMMARY_FILES = [
  '/.agent-memory/brain-brief.md',
  '/.agent-memory/route-summary.md',
  '/.agent-memory/risk-summary.md',
  '/.agent-memory/acceptance-summary.md'
];

const MANAGER_FILES = [
  '/.agent-memory/task.md',
  '/.agent-memory/working-memory.md',
  '/.agent-memory/round-contract.md',
  '/.agent-memory/acceptance-report.md',
  '/.agent-memory/orchestration-status.md',
  '/.agent-memory/execution-status.md'
];

function getTargetPath(input = {}) {
  return input.file_path || input.path || '';
}

function isSummaryFile(targetPath) {
  return SUMMARY_FILES.some((file) => targetPath.includes(file));
}

function isManagerFile(targetPath) {
  return MANAGER_FILES.some((file) => targetPath.includes(file));
}

function workspaceRoot(targetPath) {
  const idx = targetPath.lastIndexOf('/.agent-memory/');
  return idx >= 0 ? targetPath.slice(0, idx) : '';
}

export default {
  name: 'summary-sync-guard',
  description: 'Require the summary layer to exist before manager workflow files can keep evolving.',
  match: ['Edit', 'Write'],
  handler: async ({ input }) => {
    try {
      const targetPath = getTargetPath(input);
      if (!targetPath || isSummaryFile(targetPath) || !isManagerFile(targetPath)) {
        return { continue: true, suppressOutput: true };
      }

      const root = workspaceRoot(targetPath);
      if (!root) {
        return { continue: true, suppressOutput: true };
      }

      const missing = [];
      for (const summaryFile of SUMMARY_FILES) {
        const abs = `${root}${summaryFile}`;
        try {
          await Deno.stat(abs);
        } catch {
          missing.push(summaryFile.replace('/.agent-memory/', ''));
        }
      }

      if (missing.length === 0) {
        return { continue: true, suppressOutput: true };
      }

      const message = [
        'Summary sync guard blocked this write.',
        `Target: ${targetPath}`,
        `Missing summary files: ${missing.join(', ')}`,
        'Managed-agents mode keeps the brain on summaries first.',
        'Create the missing summary files in .agent-memory/ before continuing manager-level workflow writes.'
      ].join('\n');

      console.error(JSON.stringify({
        event: 'summary_sync_guard_blocked',
        file: targetPath,
        missing_summary_files: missing
      }));

      return { continue: false, output: message };
    } catch (error) {
      console.error('summary-sync-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};
