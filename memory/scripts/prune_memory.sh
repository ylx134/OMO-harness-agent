#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <workspace-root> [memory-dir-name]" >&2
  exit 1
fi

workspace_root=$1
memory_dir_name=${2:-.agent-memory}
memory_dir="$workspace_root/$memory_dir_name"
archive_dir="$memory_dir/archive"

working_limit=100
handoff_limit=80
execution_limit=120
journal_limit=400
status=0

if [[ ! -d "$memory_dir" ]]; then
  echo "Memory directory not found: $memory_dir" >&2
  exit 1
fi

line_count() {
  local file=$1
  if [[ -f "$file" ]]; then
    wc -l < "$file" | tr -d ' '
  else
    echo 0
  fi
}

working_lines=$(line_count "$memory_dir/working-memory.md")
handoff_lines=$(line_count "$memory_dir/handoff.md")
execution_lines=$(line_count "$memory_dir/execution-status.md")
journal_lines=$(line_count "$memory_dir/journal.md")

if (( working_lines > working_limit )); then
  echo "[warn] working-memory.md is $working_lines lines; compact it below $working_limit." >&2
  status=2
fi

if (( handoff_lines > handoff_limit )); then
  echo "[warn] handoff.md is $handoff_lines lines; compact it below $handoff_limit." >&2
  status=2
fi

if (( execution_lines > execution_limit )); then
  echo "[warn] execution-status.md is $execution_lines lines; compact it below $execution_limit." >&2
  status=2
fi

if (( journal_lines > journal_limit )); then
  mkdir -p "$archive_dir"
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  archive_file="$archive_dir/journal-$timestamp.md"
  cp "$memory_dir/journal.md" "$archive_file"
  cat > "$memory_dir/journal.md" <<EOF
# Journal

Older journal entries were archived to:
- ${memory_dir_name}/archive/$(basename "$archive_file")

## $(date '+%Y-%m-%d %H:%M:%S %Z') - Journal Reset
- What changed: Archived oversized journal to keep active memory lean.
- Evidence: ${memory_dir_name}/archive/$(basename "$archive_file")
- Commands:
- Output paths:
- Notes:
EOF
  echo "[ok] archived journal to $archive_file"
fi

exit "$status"
