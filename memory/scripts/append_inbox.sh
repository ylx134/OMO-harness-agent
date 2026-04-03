#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 4 || $# -gt 5 ]]; then
  echo "Usage: $0 <workspace-root> <request-id> <source> <summary> [memory-dir-name]" >&2
  exit 1
fi

workspace_root=$1
request_id=$2
source_label=$3
summary=$4
memory_dir_name=${5:-.agent-memory}
memory_dir="$workspace_root/$memory_dir_name"
inbox_dir="$memory_dir/inbox"
archive_dir="$inbox_dir/archive"
index_file="$inbox_dir/index.jsonl"
request_file="$inbox_dir/$request_id.md"
template_file="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../templates && pwd)/inbox-request.md"

mkdir -p "$inbox_dir"
mkdir -p "$archive_dir"
touch "$index_file"

if [[ ! -f "$request_file" ]]; then
  cp "$template_file" "$request_file"
fi

now_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
based_on_global_plan_version="${INBOX_BASED_ON_GLOBAL_PLAN_VERSION:-}"
merged_into_global_plan_version="${INBOX_MERGED_INTO_GLOBAL_PLAN_VERSION:-}"
merged_by_change_id="${INBOX_MERGED_BY_CHANGE_ID:-}"

update_section() {
  local file=$1
  local heading=$2
  local value=$3
  python3 - "$file" "$heading" "$value" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
heading = sys.argv[2]
value = sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
out = []
i = 0
replaced = False
while i < len(lines):
    line = lines[i]
    out.append(line)
    if line.strip() == f"# {heading}":
        i += 1
        while i < len(lines) and not lines[i].startswith("# "):
            i += 1
        if value:
            out.append("")
            out.extend(value.splitlines())
        replaced = True
        continue
    i += 1
if not replaced:
    out.append(f"# {heading}")
    out.append("")
    out.extend(value.splitlines())
path.write_text("\n".join(out) + "\n", encoding="utf-8")
PY
}

update_section "$request_file" "Request Id" "$request_id"
update_section "$request_file" "Received At" "$now_utc"
update_section "$request_file" "Source" "$source_label"
update_section "$request_file" "Original Request" "$summary"
update_section "$request_file" "Based On Global Plan Version" "$based_on_global_plan_version"
update_section "$request_file" "Decision" "pending-triage"
update_section "$request_file" "Merge State" "not-merged"
update_section "$request_file" "Merged Into Global Plan Version" "$merged_into_global_plan_version"
update_section "$request_file" "Merged By Change Id" "$merged_by_change_id"

python3 - "$index_file" "$now_utc" "$request_id" "$source_label" "$summary" "$based_on_global_plan_version" "$merged_into_global_plan_version" "$merged_by_change_id" <<'PY'
import json
import sys

path = sys.argv[1]
record = {
    "time": sys.argv[2],
    "request_id": sys.argv[3],
    "source": sys.argv[4],
    "summary": sys.argv[5],
    "status": "received",
    "plan_impact": "unclassified",
    "merge_state": "not-merged",
    "target": "",
    "based_on_global_plan_version": sys.argv[6],
    "merged_into_global_plan_version": sys.argv[7],
    "merged_by_change_id": sys.argv[8],
    "request_file": f".agent-memory/inbox/{sys.argv[3]}.md",
}
with open(path, "a", encoding="utf-8") as fh:
    fh.write(json.dumps(record, ensure_ascii=False) + "\n")
PY

echo "$request_file"
