/**
 * Evidence Verifier Hook
 * 
 * Validates that acceptance reports reference evidence files that actually exist.
 * Triggered on PostToolUse for Edit when writing acceptance-report.md.
 */
export default {
  name: "evidence-verifier",
  description: "Verify evidence files exist before allowing acceptance report writes",
  match: "Edit",
  handler: async ({ input }) => {
    try {
      if (!input.file_path || !input.file_path.includes('acceptance-report.md')) {
        return { continue: true, suppressOutput: true };
      }

      const evidencePattern = /evidence\/[^\s)]+/g;
      const newContent = input.new_string || '';
      const matches = newContent.match(evidencePattern) || [];

      if (matches.length === 0) {
        return { continue: true, suppressOutput: true };
      }

      const missing = [];
      for (const path of matches) {
        try {
          await Deno.stat(path);
        } catch {
          missing.push(path);
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
