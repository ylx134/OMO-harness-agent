/**
 * Evidence Verifier Hook
 * 
 * Validates that acceptance reports reference evidence files that actually exist.
 * Triggered on PostToolUse for Edit when writing acceptance-report.md.
 */
export default {
  name: "evidence-verifier",
  description: "Verify evidence files exist before allowing acceptance report writes",
  match: ["Edit", "Write"],
  handler: async ({ input, toolName }) => {
    try {
      if (!input.file_path || !input.file_path.includes('acceptance-report.md')) {
        return { continue: true, suppressOutput: true };
      }

      // Derive workspace root from acceptance-report.md path
      // Expected: <workspace>/.agent-memory/acceptance-report.md
      const memoryIdx = input.file_path.lastIndexOf('.agent-memory');
      const workspaceRoot = memoryIdx > 0
        ? input.file_path.substring(0, memoryIdx)
        : '';

      const evidencePattern = /evidence\/[^\s)]+/g;
      // For Write: check content field; for Edit: check new_string field
      const newContent = toolName === 'Write' ? (input.content || '') : (input.new_string || '');
      const matches = newContent.match(evidencePattern) || [];

      if (matches.length === 0) {
        return { continue: true, suppressOutput: true };
      }

      const missing = [];
      for (const relPath of matches) {
        const absPath = workspaceRoot ? `${workspaceRoot}${relPath}` : relPath;
        try {
          await Deno.stat(absPath);
        } catch {
          missing.push(relPath);
        }
      }

      if (missing.length > 0) {
        console.error(JSON.stringify({
          event: "evidence_verification_failed",
          missing_files: missing,
          message: `Evidence files missing: ${missing.join(', ')}`
        }));
        return { continue: false, output: `Evidence verification failed. Missing files: ${missing.join(', ')}` };
      }

      return { continue: true, suppressOutput: true };
    } catch (error) {
      console.error('evidence-verifier error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};
