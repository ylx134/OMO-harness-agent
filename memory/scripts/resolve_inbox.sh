#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 3 || $# -gt 5 ]]; then
  echo "Usage: $0 <workspace-root> <request-id> <decision> [merge-target] [memory-dir-name]" >&2
  exit 1
fi

workspace_root=$1
request_id=$2
decision=$3
merge_target=${4:-}
memory_dir_name=${5:-.agent-memory}
memory_dir="$workspace_root/$memory_dir_name"
inbox_dir="$memory_dir/inbox"
archive_dir="$inbox_dir/archive"
index_file="$inbox_dir/index.jsonl"
request_file="$inbox_dir/$request_id.md"
orchestration_status_file="$memory_dir/orchestration-status.md"
task_file="$memory_dir/task.md"
working_file="$memory_dir/working-memory.md"
activity_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/append_activity.sh"
handoff_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build_handoff.sh"

if [[ ! -f "$request_file" ]]; then
  echo "Request file not found: $request_file" >&2
  exit 1
fi

extract_section() {
  local file=$1
  local heading=$2
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  awk -v heading="$heading" '
    function flush_section() {
      if (capture && section_has_text) {
        last_section = section_raw
      }
      section_raw = ""
      section_has_text = 0
    }
    $0 ~ "^#+ " heading "$" {
      flush_section()
      capture = 1
      next
    }
    /^#+ / && capture {
      flush_section()
      capture = 0
      next
    }
    capture {
      section_raw = section_raw $0 ORS
      if ($0 !~ /^[[:space:]]*$/) {
        section_has_text = 1
      }
    }
    END {
      flush_section()
      if (last_section != "") {
        printf "%s", last_section
      }
    }
  ' "$file" | sed '/^[[:space:]]*$/d' | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//'
}

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

json_escape() {
  python3 - "$1" <<'PY'
import json, sys
print(json.dumps(sys.argv[1], ensure_ascii=False))
PY
}

now_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
current_global_plan_version="$(extract_section "$task_file" "Global Plan Version")"
based_on_global_plan_version="$(extract_section "$request_file" "Based On Global Plan Version")"
current_active_phase="$(extract_section "$working_file" "Active Global Phase")"
if [[ -z "$current_active_phase" ]]; then
  current_active_phase="$(extract_section "$working_file" "Active Phase")"
fi
current_round="$(extract_section "$working_file" "Current Round")"
change_id="${RESOLVE_CHANGE_ID:-}"

decision_value=""
merge_state=""
merged_into_global_plan_version=""
merged_by_change_id=""
status=""
plan_impact=""
activity_event=""
owed_writeback=""
request_path_for_index=".agent-memory/inbox/${request_id}.md"

case "$decision" in
  merge-global)
    if [[ -z "$based_on_global_plan_version" || -z "$current_global_plan_version" || "$based_on_global_plan_version" != "$current_global_plan_version" ]]; then
      decision_value="needs-retriage"
      merge_state="version-conflict"
      status="blocked-version-conflict"
      plan_impact="none"
      activity_event="inbox_merge_blocked"
      owed_writeback="按当前 Global Plan Version ${current_global_plan_version} 重新判断 impact 和 merge target"
    else
      decision_value="accepted"
      merge_state="merged"
      status="merged"
      plan_impact="global"
      activity_event="inbox_merged"
      merged_into_global_plan_version="$current_global_plan_version"
      merged_by_change_id="$change_id"
      owed_writeback="none"
    fi
    ;;
  merge-local)
    if [[ -z "$based_on_global_plan_version" || -z "$current_global_plan_version" || "$based_on_global_plan_version" != "$current_global_plan_version" ]]; then
      decision_value="needs-retriage"
      merge_state="version-conflict"
      status="blocked-version-conflict"
      plan_impact="none"
      activity_event="inbox_merge_blocked"
      owed_writeback="按当前 Global Plan Version ${current_global_plan_version} 重新判断 impact 和 merge target"
    else
      decision_value="accepted"
      merge_state="merged"
      status="merged"
      plan_impact="local"
      activity_event="inbox_merged"
      merged_into_global_plan_version="$current_global_plan_version"
      merged_by_change_id="$change_id"
      owed_writeback="none"
    fi
    ;;
  defer)
    decision_value="deferred"
    merge_state="not-merged"
    status="deferred"
    plan_impact="none"
    activity_event="inbox_deferred"
    owed_writeback="none"
    ;;
  reject)
    decision_value="rejected"
    merge_state="rejected"
    status="rejected"
    plan_impact="none"
    activity_event="inbox_rejected"
    owed_writeback="none"
    ;;
  *)
    echo "Unsupported decision: $decision" >&2
    exit 1
    ;;
esac

update_section "$request_file" "Decision" "$decision_value"
update_section "$request_file" "Merge State" "$merge_state"
update_section "$request_file" "Suggested Merge Target" "$merge_target"
update_section "$request_file" "Merged Into Global Plan Version" "$merged_into_global_plan_version"
update_section "$request_file" "Owed Writeback" "$owed_writeback"
update_section "$request_file" "Merged By Change Id" "$merged_by_change_id"

if [[ "$merge_state" == "merged" || "$merge_state" == "rejected" ]]; then
  mkdir -p "$archive_dir"
  archived_request_file="$archive_dir/${request_id}.md"
  mv "$request_file" "$archived_request_file"
  request_path_for_index=".agent-memory/inbox/archive/${request_id}.md"
fi

python3 - "$index_file" "$now_utc" "$request_id" "$status" "$plan_impact" "$merge_state" "$merge_target" "$based_on_global_plan_version" "$merged_into_global_plan_version" "$merged_by_change_id" "$request_path_for_index" <<'PY'
import json
import sys

path = sys.argv[1]
record = {
    "time": sys.argv[2],
    "request_id": sys.argv[3],
    "status": sys.argv[4],
    "plan_impact": sys.argv[5],
    "merge_state": sys.argv[6],
    "target": sys.argv[7],
    "based_on_global_plan_version": sys.argv[8],
    "merged_into_global_plan_version": sys.argv[9],
    "merged_by_change_id": sys.argv[10],
    "request_file": sys.argv[11],
}
with open(path, "a", encoding="utf-8") as fh:
    fh.write(json.dumps(record, ensure_ascii=False) + "\n")
PY

pending_count=$(find "$inbox_dir" -maxdepth 1 -type f -name 'REQ-*.md' | wc -l | tr -d ' ')
active_inbox_request="none"
if [[ "$pending_count" != "0" ]]; then
  active_inbox_request=$(find "$inbox_dir" -maxdepth 1 -type f -name 'REQ-*.md' | sort | head -n 1 | xargs -n 1 basename | sed 's/\.md$//')
fi

inbox_merge_permission="allowed"
if [[ "$merge_state" == "version-conflict" ]]; then
  inbox_merge_permission="blocked until re-triage against Global Plan Version ${current_global_plan_version}"
elif [[ "$pending_count" != "0" ]]; then
  inbox_merge_permission="triage-required"
fi

update_section "$orchestration_status_file" "Inbox Index File" ".agent-memory/inbox/index.jsonl"
update_section "$orchestration_status_file" "Inbox Pending Count" "$pending_count"
update_section "$orchestration_status_file" "Active Inbox Request" "$active_inbox_request"
update_section "$orchestration_status_file" "Inbox Merge Permission" "$inbox_merge_permission"
update_section "$orchestration_status_file" "Owed Writeback" "$owed_writeback"
update_section "$orchestration_status_file" "Active Phase" "$current_active_phase"
update_section "$orchestration_status_file" "Active Round" "$current_round"

if [[ "$merge_state" == "merged" ]]; then
  update_section "$orchestration_status_file" "Current Routing Step" "inbox-resolved -> continue-execution"
  update_section "$orchestration_status_file" "Last Formal Writer" "resolve_inbox"
  update_section "$orchestration_status_file" "Expected Next Writer" "drive"
elif [[ "$merge_state" == "version-conflict" ]]; then
  update_section "$orchestration_status_file" "Current Routing Step" "inbox-blocked -> re-triage-required"
  update_section "$orchestration_status_file" "Last Formal Writer" "resolve_inbox"
  update_section "$orchestration_status_file" "Expected Next Writer" "planner-or-main-thread"
elif [[ "$merge_state" == "rejected" ]]; then
  update_section "$orchestration_status_file" "Current Routing Step" "inbox-rejected -> continue-existing-plan"
  update_section "$orchestration_status_file" "Last Formal Writer" "resolve_inbox"
  update_section "$orchestration_status_file" "Expected Next Writer" "drive"
else
  update_section "$orchestration_status_file" "Current Routing Step" "inbox-deferred -> continue-existing-plan"
  update_section "$orchestration_status_file" "Last Formal Writer" "resolve_inbox"
  update_section "$orchestration_status_file" "Expected Next Writer" "drive"
fi

ACTIVITY_ROUTE_ID="${RESOLVE_ROUTE_ID:-$(extract_section "$orchestration_status_file" "Route Id")}" \
ACTIVITY_TASK_TYPE="${RESOLVE_TASK_TYPE:-$(extract_section "$orchestration_status_file" "Task Type")}" \
ACTIVITY_FLOW_TIER="${RESOLVE_FLOW_TIER:-$(extract_section "$orchestration_status_file" "Flow Tier")}" \
ACTIVITY_PHASE="${RESOLVE_PHASE:-$(extract_section "$orchestration_status_file" "Active Phase")}" \
ACTIVITY_ROUND="${RESOLVE_ROUND:-$(extract_section "$orchestration_status_file" "Active Round")}" \
ACTIVITY_PLAN_IMPACT="$plan_impact" \
ACTIVITY_ACTOR="${RESOLVE_ACTOR:-main-thread}" \
ACTIVITY_STATUS="$status" \
ACTIVITY_CHANGE_ID="$change_id" \
ACTIVITY_REQUEST_ID="$request_id" \
ACTIVITY_BASED_ON_GLOBAL_PLAN_VERSION="$based_on_global_plan_version" \
ACTIVITY_NEW_GLOBAL_PLAN_VERSION="$merged_into_global_plan_version" \
ACTIVITY_SUPERSEDES_PLAN_VERSION="" \
ACTIVITY_FILES_UPDATED="[\".agent-memory/inbox/index.jsonl\",\"${request_path_for_index}\",\".agent-memory/orchestration-status.md\"]" \
bash "$activity_script" "$workspace_root" "$activity_event" "Inbox resolution for ${request_id}" "$memory_dir_name" >/dev/null

bash "$handoff_script" "$workspace_root" "$memory_dir_name" >/dev/null

echo "$status"
