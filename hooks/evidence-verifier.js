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

function normalizeEvidencePath(root, relPath) {
  if (!root) return relPath;
  if (relPath.startsWith('/')) return relPath;
  return `${root}/${relPath}`;
}

export default {
  name: 'evidence-verifier',
  description: 'Verify that managed-agent acceptance files only cite evidence paths that actually exist.',
  match: ['Edit', 'Write'],
  handler: async ({ input, toolName }) => {
    try {
      const targetPath = getTargetPath(input);
      if (!targetPath) {
        return { continue: true, suppressOutput: true };
      }

      const isAcceptanceSurface = targetPath.includes('/.agent-memory/acceptance-report.md') ||
        targetPath.includes('/.agent-memory/acceptance-summary.md');
      if (!isAcceptanceSurface) {
        return { continue: true, suppressOutput: true };
      }

      const newContent = getNewContent(input, toolName);
      const matches = [...new Set(newContent.match(/evidence\/[^\s)\]\}>"']+/g) || [])];
      if (matches.length === 0) {
        return { continue: true, suppressOutput: true };
      }

      const root = workspaceRoot(targetPath);
      const missing = [];
      for (const relPath of matches) {
        const absPath = normalizeEvidencePath(root, relPath);
        try {
          await Deno.stat(absPath);
        } catch {
          missing.push(relPath);
        }
      }

      if (missing.length === 0) {
        return { continue: true, suppressOutput: true };
      }

      const message = [
        'Evidence verification failed.',
        `Target: ${targetPath}`,
        `Missing evidence files: ${missing.join(', ')}`,
        'Acceptance surfaces must cite real evidence artifacts, not planned or guessed paths.'
      ].join('\n');

      console.error(JSON.stringify({
        event: 'evidence_verification_failed',
        file: targetPath,
        missing_files: missing
      }));

      return { continue: false, output: message };
    } catch (error) {
      console.error('evidence-verifier error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};
