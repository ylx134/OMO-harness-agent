#!/usr/bin/env bash
# Context Reset Helper
# Prepares handoff specifically for context resets (not phase transitions)

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <workspace-root> <reset-reason> [memory-dir-name]" >&2
  echo "" >&2
  echo "Reset reasons:" >&2
  echo "  tool-count-limit    - Helper exceeded 50 tool calls" >&2
  echo "  context-usage-high  - Context window > 70%" >&2
  echo "  re-anchor-failure   - 3 consecutive re-anchor failures" >&2
  echo "  drift-detected      - Helper changing protected definitions" >&2
  echo "  coherence-loss      - Memory files disagree" >&2
  echo "  churn-pattern       - Activity without progress" >&2
  echo "  restart-signal      - Acceptance requested restart" >&2
  echo "  user-request        - User explicitly requested reset" >&2
  exit 1
fi

workspace_root=$1
reset_reason=$2
memory_dir_name=${3:-.agent-memory}
memory_dir="$workspace_root/$memory_dir_name"
orchestration_file="$memory_dir/orchestration-status.md"

# First, build the standard handoff
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
handoff_file=$("$script_dir/build_handoff.sh" "$workspace_root" "$memory_dir_name")

# Add context reset metadata to handoff
{
  echo ""
  echo "# Context Reset Metadata"
  echo ""
  echo "**This is a context reset, not a phase transition.**"
  echo ""
  echo "- Reset reason: $reset_reason"
  echo "- Reset timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "- Previous helper: closed"
  echo "- New helper: starting with clean context"
  echo ""
  echo "## What to Preserve"
  echo ""
  echo "- Whole-task goal (unchanged)"
  echo "- Active phase (unchanged)"
  echo "- Current round (unchanged)"
  echo "- Verified facts from previous helper"
  echo "- Evidence already captured"
  echo ""
  echo "## What NOT to Re-Do"
  echo ""
  echo "- Do not re-plan the whole task"
  echo "- Do not re-negotiate the round contract"
  echo "- Do not re-verify already accepted work"
  echo "- Do not re-read full history"
  echo ""
  echo "## Next Action"
  echo ""
  echo "Continue the current round from where the previous helper left off."
  echo "Read only the files listed in 'Files To Read First' section above."
  echo ""
} >> "$handoff_file"

# Update orchestration status
if [[ -f "$orchestration_file" ]]; then
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  # Check if Context Resets section exists
  if grep -q "^# Context Resets" "$orchestration_file"; then
    # Update existing section
    awk -v reason="$reset_reason" -v ts="$timestamp" '
      /^# Context Resets/ { in_section=1 }
      in_section && /^- Total resets:/ {
        match($0, /: ([0-9]+)/, arr)
        count = arr[1] + 1
        print "- Total resets: " count
        next
      }
      in_section && /^- Last reset:/ {
        print "- Last reset: " ts
        next
      }
      in_section && /^- Last reset reason:/ {
        print "- Last reset reason: " reason
        next
      }
      in_section && /^# / && !/^# Context Resets/ { in_section=0 }
      { print }
    ' "$orchestration_file" > "$orchestration_file.tmp"
    mv "$orchestration_file.tmp" "$orchestration_file"
  else
    # Add new section
    {
      echo ""
      echo "# Context Resets"
      echo ""
      echo "- Total resets: 1"
      echo "- Last reset: $timestamp"
      echo "- Last reset reason: $reset_reason"
      echo ""
    } >> "$orchestration_file"
  fi
fi

echo "[ok] Context reset handoff prepared: $handoff_file"
echo "[ok] Reset reason: $reset_reason"
echo "[ok] Orchestration status updated"
