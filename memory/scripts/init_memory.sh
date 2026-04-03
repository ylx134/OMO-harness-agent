#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <workspace-root> [memory-dir-name]" >&2
  exit 1
fi

workspace_root=$1
memory_dir_name=${2:-.agent-memory}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(cd "$script_dir/.." && pwd)"
template_dir="$skill_dir/templates"
memory_dir="$workspace_root/$memory_dir_name"
evidence_dir="$workspace_root/evidence"

mkdir -p "$memory_dir"
mkdir -p "$evidence_dir"
mkdir -p "$memory_dir/inbox"
mkdir -p "$memory_dir/inbox/archive"

# Create evidence subdirectories for organized proof storage
mkdir -p "$evidence_dir/screenshots"
mkdir -p "$evidence_dir/command-outputs"
mkdir -p "$evidence_dir/api-traces"
mkdir -p "$evidence_dir/artifacts"
mkdir -p "$evidence_dir/smoke-tests"

for name in task product-spec baseline-source capability-map gap-analysis quality-guardrails working-memory round-contract acceptance-report evidence-ledger orchestration-status plan-graph execution-status acceptance-lessons decisions handoff journal autopilot-status iterations; do
  src="$template_dir/$name.md"
  dst="$memory_dir/$name.md"
  if [[ -f "$dst" ]]; then
    echo "[skip] $dst already exists"
    continue
  fi
  cp "$src" "$dst"
  echo "[ok] created $dst"
done

init_file="$workspace_root/init.sh"
if [[ -f "$init_file" ]]; then
  echo "[skip] $init_file already exists"
else
  cat > "$init_file" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

echo "Customize init.sh for this project before relying on autonomous startup."
EOF
  chmod +x "$init_file"
  echo "[ok] created $init_file"
fi

progress_file="$workspace_root/claude-progress.txt"
if [[ -f "$progress_file" ]]; then
  echo "[skip] $progress_file already exists"
else
  timestamp="$(date '+%Y-%m-%d %H:%M %Z')"
  cat > "$progress_file" <<EOF
=== Session 1 ($timestamp) ===
Completed:
Working on:
Blocked:
Notes:
EOF
  echo "[ok] created $progress_file"
fi

activity_file="$memory_dir/activity.jsonl"
if [[ -f "$activity_file" ]]; then
  echo "[skip] $activity_file already exists"
else
  : > "$activity_file"
  echo "[ok] created $activity_file"
fi

inbox_index_file="$memory_dir/inbox/index.jsonl"
if [[ -f "$inbox_index_file" ]]; then
  echo "[skip] $inbox_index_file already exists"
else
  : > "$inbox_index_file"
  echo "[ok] created $inbox_index_file"
fi

# Copy smoke test template to scripts/ if it doesn't exist
scripts_dir="$workspace_root/scripts"
mkdir -p "$scripts_dir"
smoke_test_template="$skill_dir/scripts/smoke_test_template.sh"
smoke_test_dst="$scripts_dir/smoke_test.sh"
if [[ -f "$smoke_test_template" && ! -f "$smoke_test_dst" ]]; then
  cp "$smoke_test_template" "$smoke_test_dst"
  chmod +x "$smoke_test_dst"
  echo "[ok] created $smoke_test_dst (customize for your project)"
fi

echo "[ok] ensured $evidence_dir with subdirectories"
