#!/bin/bash
# orchestration_gate.sh — Verify the current writer role before allowing a write operation.
#
# Usage: orchestration_gate.sh <writer_role> [workspace]
#   writer_role: planner | executor | checker | control
#   workspace:   path to workspace root (default: current directory)
#
# Exit codes:
#   0 — role matches Expected Next Writer, write allowed
#   1 — role mismatch, write should be blocked
#   2 — orchestration-status.md not found or unreadable

set -euo pipefail

WRITER_ROLE="${1:?Usage: orchestration_gate.sh <writer_role> [workspace]}"
WORKSPACE="${2:-.}"
STATUS_FILE="$WORKSPACE/.agent-memory/orchestration-status.md"

if [ ! -f "$STATUS_FILE" ]; then
  echo "ERROR: orchestration-status.md not found at $STATUS_FILE" >&2
  exit 2
fi

# Extract Expected Next Writer from the status file
EXPECTED=$(grep -i "Expected Next Writer" "$STATUS_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]')

if [ -z "$EXPECTED" ]; then
  echo "WARNING: No 'Expected Next Writer' field found in orchestration-status.md" >&2
  echo "Allowing write (field missing — may be initial setup)" >&2
  exit 0
fi

if [ "$WRITER_ROLE" = "$EXPECTED" ]; then
  exit 0
else
  echo "BLOCKED: Writer role '$WRITER_ROLE' does not match Expected Next Writer '$EXPECTED'" >&2
  echo "Current orchestration-status.md expects: $EXPECTED" >&2
  echo "Action: Stop and report to control. Do not write to owned files." >&2
  exit 1
fi
