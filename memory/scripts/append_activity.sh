#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: $0 <workspace-root> <event-type> <summary> [memory-dir-name]" >&2
  exit 1
fi

workspace_root=$1
event_type=$2
summary=$3
memory_dir_name=${4:-.agent-memory}
memory_dir="$workspace_root/$memory_dir_name"
activity_file="$memory_dir/activity.jsonl"
orchestration_status_file="$memory_dir/orchestration-status.md"
working_file="$memory_dir/working-memory.md"

mkdir -p "$memory_dir"
touch "$activity_file"

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

json_escape() {
  python3 - "$1" <<'PY'
import json, sys
print(json.dumps(sys.argv[1], ensure_ascii=False))
PY
}

now_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
route_id="${ACTIVITY_ROUTE_ID:-$(extract_section "$orchestration_status_file" "Route Id")}"
task_type="${ACTIVITY_TASK_TYPE:-$(extract_section "$orchestration_status_file" "Task Type")}"
flow_tier="${ACTIVITY_FLOW_TIER:-$(extract_section "$orchestration_status_file" "Flow Tier")}"
current_phase="${ACTIVITY_PHASE:-$(extract_section "$orchestration_status_file" "Active Phase")}"
current_round="${ACTIVITY_ROUND:-$(extract_section "$orchestration_status_file" "Active Round")}"
plan_impact="${ACTIVITY_PLAN_IMPACT:-}"
actor="${ACTIVITY_ACTOR:-}"
status="${ACTIVITY_STATUS:-}"
change_id="${ACTIVITY_CHANGE_ID:-}"
request_id="${ACTIVITY_REQUEST_ID:-}"
based_on_global_plan_version="${ACTIVITY_BASED_ON_GLOBAL_PLAN_VERSION:-}"
new_global_plan_version="${ACTIVITY_NEW_GLOBAL_PLAN_VERSION:-}"
supersedes_plan_version="${ACTIVITY_SUPERSEDES_PLAN_VERSION:-}"
files_updated="${ACTIVITY_FILES_UPDATED:-[]}"
evidence_ids="${ACTIVITY_EVIDENCE_IDS:-[]}"

{
  printf '{'
  printf '"time":%s,' "$(json_escape "$now_utc")"
  printf '"event_type":%s,' "$(json_escape "$event_type")"
  printf '"summary":%s,' "$(json_escape "$summary")"
  printf '"route_id":%s,' "$(json_escape "$route_id")"
  printf '"task_type":%s,' "$(json_escape "$task_type")"
  printf '"flow_tier":%s,' "$(json_escape "$flow_tier")"
  printf '"phase":%s,' "$(json_escape "$current_phase")"
  printf '"round":%s,' "$(json_escape "$current_round")"
  printf '"plan_impact":%s,' "$(json_escape "$plan_impact")"
  printf '"actor":%s,' "$(json_escape "$actor")"
  printf '"status":%s,' "$(json_escape "$status")"
  printf '"change_id":%s,' "$(json_escape "$change_id")"
  printf '"request_id":%s,' "$(json_escape "$request_id")"
  printf '"based_on_global_plan_version":%s,' "$(json_escape "$based_on_global_plan_version")"
  printf '"new_global_plan_version":%s,' "$(json_escape "$new_global_plan_version")"
  printf '"supersedes_plan_version":%s,' "$(json_escape "$supersedes_plan_version")"
  printf '"files_updated":%s,' "$files_updated"
  printf '"evidence_ids":%s' "$evidence_ids"
  printf '}\n'
} >> "$activity_file"

echo "$activity_file"
