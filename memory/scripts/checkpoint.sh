#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 || $# -gt 3 ]]; then
  echo "Usage: $0 <workspace-root> [label] [memory-dir-name]" >&2
  exit 1
fi

workspace_root=$1
label=${2:-checkpoint}
memory_dir_name=${3:-.agent-memory}
memory_dir="$workspace_root/$memory_dir_name"

if [[ ! -d "$memory_dir" ]]; then
  echo "Memory directory not found: $memory_dir" >&2
  exit 1
fi

safe_label="$(printf '%s' "$label" | tr '[:space:]' '-' | tr -cd '[:alnum:]_-')"
timestamp="$(date '+%Y%m%d-%H%M%S')"
target_dir="$memory_dir/checkpoints/$timestamp-$safe_label"

mkdir -p "$target_dir"

for file in task.md working-memory.md plan-graph.md execution-status.md decisions.md handoff.md journal.md activity.jsonl; do
  if [[ -f "$memory_dir/$file" ]]; then
    cp "$memory_dir/$file" "$target_dir/$file"
  fi
done

if [[ -d "$memory_dir/inbox" ]]; then
  cp -R "$memory_dir/inbox" "$target_dir/inbox"
fi

echo "$target_dir"
