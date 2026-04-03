#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <workspace-root> [memory-dir-name]" >&2
  exit 1
fi

workspace_root=$1
memory_dir_name=${2:-.agent-memory}
memory_dir="$workspace_root/$memory_dir_name"
task_file="$memory_dir/task.md"
product_spec_file="$memory_dir/product-spec.md"
working_file="$memory_dir/working-memory.md"
round_contract_file="$memory_dir/round-contract.md"
acceptance_report_file="$memory_dir/acceptance-report.md"
evidence_ledger_file="$memory_dir/evidence-ledger.md"
orchestration_status_file="$memory_dir/orchestration-status.md"
handoff_file="$memory_dir/handoff.md"
inbox_index_file="$memory_dir/inbox/index.jsonl"

if [[ ! -f "$task_file" || ! -f "$working_file" ]]; then
  echo "Expected task.md and working-memory.md under $memory_dir" >&2
  exit 1
fi

extract_section() {
  local file=$1
  local heading=$2
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
  ' "$file" | sed '/^[[:space:]]*$/d'
}

coalesce_section() {
  local value=$1
  if [[ -n "$value" ]]; then
    printf '%s\n' "$value"
  else
    printf '_Not recorded yet._\n'
  fi
}

current_goal="$(extract_section "$working_file" "Current Goal")"
if [[ -z "$current_goal" ]]; then
  current_goal="$(extract_section "$working_file" "Phase Goal")"
fi
if [[ -z "$current_goal" ]]; then
  current_goal="$(extract_section "$round_contract_file" "Round Goal")"
fi
if [[ -z "$current_goal" ]]; then
  current_goal="$(extract_section "$task_file" "Final Goal")"
fi
if [[ -z "$current_goal" ]]; then
  current_goal="$(extract_section "$task_file" "Goal")"
fi
global_plan_version="$(extract_section "$task_file" "Global Plan Version")"

done_criteria="$(extract_section "$working_file" "Done Criteria")"
if [[ -z "$done_criteria" ]]; then
  done_criteria="$(extract_section "$task_file" "Done Criteria")"
fi

hard_constraints="$(extract_section "$task_file" "Hard Constraints")"
product_spec_pointer="$(extract_section "$task_file" "Product Spec File")"
if [[ -z "$product_spec_pointer" ]]; then
  product_spec_pointer="$(extract_section "$task_file" "Product Spec Pointer")"
fi
global_plan="$(extract_section "$task_file" "Global Plan")"
if [[ -z "$global_plan" ]]; then
  global_plan="$(extract_section "$task_file" "Global Phase Structure")"
fi
active_global_phase="$(extract_section "$working_file" "Active Global Phase")"
if [[ -z "$active_global_phase" ]]; then
  active_global_phase="$(extract_section "$working_file" "Active Phase")"
fi
current_round="$(extract_section "$working_file" "Current Round")"
route_id=""
task_type=""
flow_tier=""
reason_for_lane=""
routing_contract_row=""
resolved_skill_stack=""
default_main_route=""
required_startup_files=""
required_deliverables=""
missing_deliverables=""
route_blocking_gaps=""
inbox_pending_summary=""
active_inbox_request=""
inbox_merge_permission=""
run_mode=""
orchestration_proof_level=""
planner_agent_id=""
planner_agent_state=""
executor_agent_id=""
executor_agent_state=""
checker_agent_id=""
checker_agent_state=""
agent_launch_policy=""
local_plan="$(extract_section "$working_file" "Local Plan")"
based_on_global_plan_version="$(extract_section "$working_file" "Based On Global Plan Version")"
local_plan_revision="$(extract_section "$working_file" "Local Plan Revision")"
current_path="$(extract_section "$working_file" "Current Path")"
latest_evidence="$(extract_section "$working_file" "Latest Evidence")"
current_blockers="$(extract_section "$working_file" "Current Blockers")"
next_step="$(extract_section "$working_file" "Next Step")"
if [[ -z "$next_step" ]]; then
  next_step="$(extract_section "$working_file" "Immediate Next Step")"
fi
current_product_spec_focus="$(extract_section "$working_file" "Current Product-Spec Focus")"
files_to_read="$(extract_section "$working_file" "Files To Read If Needed")"
release_critical_journeys=""
if [[ -f "$product_spec_file" ]]; then
  release_critical_journeys="$(extract_section "$product_spec_file" "Release-Critical Checks")"
fi
round_contract_summary=""
if [[ -f "$round_contract_file" ]]; then
  round_contract_summary="$(extract_section "$round_contract_file" "Round Goal")"
fi
acceptance_report_summary=""
if [[ -f "$acceptance_report_file" ]]; then
  acceptance_report_summary="$(extract_section "$acceptance_report_file" "Decision")"
fi
evidence_gap_summary=""
if [[ -f "$evidence_ledger_file" ]]; then
  evidence_gap_summary="$(extract_section "$evidence_ledger_file" "Evidence Gaps")"
fi
owed_writeback_summary=""
formal_handoff_state=""
emergency_patch_summary=""
if [[ -f "$orchestration_status_file" ]]; then
  run_mode="$(extract_section "$orchestration_status_file" "Run Mode")"
  orchestration_proof_level="$(extract_section "$orchestration_status_file" "Orchestration Proof Level")"
  route_id="$(extract_section "$orchestration_status_file" "Route Id")"
  task_type="$(extract_section "$orchestration_status_file" "Task Type")"
  flow_tier="$(extract_section "$orchestration_status_file" "Flow Tier")"
  reason_for_lane="$(extract_section "$orchestration_status_file" "Reason For Lane")"
  routing_contract_row="$(extract_section "$orchestration_status_file" "Routing Contract Row")"
  resolved_skill_stack="$(extract_section "$orchestration_status_file" "Resolved Skill Stack")"
  default_main_route="$(extract_section "$orchestration_status_file" "Default Main Route")"
  required_startup_files="$(extract_section "$orchestration_status_file" "Required Startup Files")"
  required_deliverables="$(extract_section "$orchestration_status_file" "Required Deliverables")"
  missing_deliverables="$(extract_section "$orchestration_status_file" "Missing Deliverables")"
  route_blocking_gaps="$(extract_section "$orchestration_status_file" "Route Blocking Gaps")"
  inbox_pending_summary="$(extract_section "$orchestration_status_file" "Inbox Pending Count")"
  active_inbox_request="$(extract_section "$orchestration_status_file" "Active Inbox Request")"
  inbox_merge_permission="$(extract_section "$orchestration_status_file" "Inbox Merge Permission")"
  planner_agent_id="$(extract_section "$orchestration_status_file" "Planner Agent Id")"
  planner_agent_state="$(extract_section "$orchestration_status_file" "Planner Agent State")"
  executor_agent_id="$(extract_section "$orchestration_status_file" "Executor Agent Id")"
  executor_agent_state="$(extract_section "$orchestration_status_file" "Executor Agent State")"
  checker_agent_id="$(extract_section "$orchestration_status_file" "Checker Agent Id")"
  checker_agent_state="$(extract_section "$orchestration_status_file" "Checker Agent State")"
  agent_launch_policy="$(extract_section "$orchestration_status_file" "Agent Launch Policy")"
  owed_writeback_summary="$(extract_section "$orchestration_status_file" "Owed Writeback")"
  formal_handoff_state="$(extract_section "$orchestration_status_file" "Formal Handoff State")"
  emergency_patch_summary="$(extract_section "$orchestration_status_file" "Emergency Main-Thread Patch")"
fi

tmp_file="$(mktemp)"
{
  echo "# Handoff"
  echo
  echo "Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo
  echo "# Current Goal"
  echo
  coalesce_section "$current_goal"
  echo
  echo "# Global Plan Version"
  echo
  coalesce_section "$global_plan_version"
  echo
  echo "# Current Product Spec File"
  echo
  if [[ -n "$product_spec_pointer" ]]; then
    printf '%s\n' "$product_spec_pointer"
  else
    printf '%s\n' "${memory_dir_name}/product-spec.md"
  fi
  echo
  echo "# Done Criteria"
  echo
  coalesce_section "$done_criteria"
  echo
  echo "# Hard Constraints"
  echo
  coalesce_section "$hard_constraints"
  echo
  echo "# Global Plan Snapshot"
  echo
  coalesce_section "$global_plan"
  echo
  echo "# Active Global Phase"
  echo
  coalesce_section "$active_global_phase"
  echo
  echo "# Current Round"
  echo
  coalesce_section "$current_round"
  echo
  echo "# Route Id"
  echo
  coalesce_section "$route_id"
  echo
  echo "# Task Type"
  echo
  coalesce_section "$task_type"
  echo
  echo "# Flow Tier"
  echo
  coalesce_section "$flow_tier"
  echo
  echo "# Reason For Lane"
  echo
  coalesce_section "$reason_for_lane"
  echo
  echo "# Routing Contract Row"
  echo
  coalesce_section "$routing_contract_row"
  echo
  echo "# Resolved Skill Stack"
  echo
  coalesce_section "$resolved_skill_stack"
  echo
  echo "# Required Startup Files"
  echo
  coalesce_section "$required_startup_files"
  echo
  echo "# Default Main Route"
  echo
  coalesce_section "$default_main_route"
  echo
  echo "# Required Deliverables"
  echo
  coalesce_section "$required_deliverables"
  echo
  echo "# Missing Deliverables"
  echo
  coalesce_section "$missing_deliverables"
  echo
  echo "# Route Blocking Gaps"
  echo
  coalesce_section "$route_blocking_gaps"
  echo
  echo "# Inbox Pending Summary"
  echo
  coalesce_section "$inbox_pending_summary"
  echo
  echo "# Active Inbox Request"
  echo
  coalesce_section "$active_inbox_request"
  echo
  echo "# Inbox Merge Permission"
  echo
  coalesce_section "$inbox_merge_permission"
  echo
  echo "# Planner Agent Id"
  echo
  coalesce_section "$planner_agent_id"
  echo
  echo "# Planner Agent State"
  echo
  coalesce_section "$planner_agent_state"
  echo
  echo "# Executor Agent Id"
  echo
  coalesce_section "$executor_agent_id"
  echo
  echo "# Executor Agent State"
  echo
  coalesce_section "$executor_agent_state"
  echo
  echo "# Checker Agent Id"
  echo
  coalesce_section "$checker_agent_id"
  echo
  echo "# Checker Agent State"
  echo
  coalesce_section "$checker_agent_state"
  echo
  echo "# Agent Launch Policy"
  echo
  coalesce_section "$agent_launch_policy"
  echo
  echo "# Run Mode"
  echo
  coalesce_section "$run_mode"
  echo
  echo "# Orchestration Proof Level"
  echo
  coalesce_section "$orchestration_proof_level"
  echo
  echo "# Current Round Contract File"
  echo
  printf '%s\n' "${memory_dir_name}/round-contract.md"
  echo
  echo "# Current Acceptance Report File"
  echo
  printf '%s\n' "${memory_dir_name}/acceptance-report.md"
  echo
  echo "# Current Evidence Ledger File"
  echo
  printf '%s\n' "${memory_dir_name}/evidence-ledger.md"
  echo
  echo "# Current Orchestration Status File"
  echo
  printf '%s\n' "${memory_dir_name}/orchestration-status.md"
  echo
  echo "# Based On Global Plan Version"
  echo
  coalesce_section "$based_on_global_plan_version"
  echo
  echo "# Local Plan Revision"
  echo
  coalesce_section "$local_plan_revision"
  echo
  echo "# Local Plan"
  echo
  coalesce_section "$local_plan"
  echo
  echo "# Current Product-Spec Focus"
  echo
  coalesce_section "$current_product_spec_focus"
  echo
  echo "# Current Path"
  echo
  coalesce_section "$current_path"
  echo
  echo "# Latest Evidence"
  echo
  coalesce_section "$latest_evidence"
  echo
  echo "# Open Blockers"
  echo
  coalesce_section "$current_blockers"
  echo
  echo "# Next Step"
  echo
  coalesce_section "$next_step"
  echo
  echo "# Progress Views"
  echo
  echo "- $memory_dir_name/plan-graph.md"
  echo "- $memory_dir_name/execution-status.md"
  echo "- $memory_dir_name/round-contract.md"
  echo "- $memory_dir_name/acceptance-report.md"
  echo "- $memory_dir_name/evidence-ledger.md"
  echo "- $memory_dir_name/orchestration-status.md"
  echo
  echo "# Files To Read First"
  echo
  echo "- $memory_dir_name/task.md"
  echo "- $memory_dir_name/product-spec.md"
  echo "- $memory_dir_name/baseline-source.md"
  echo "- $memory_dir_name/capability-map.md"
  echo "- $memory_dir_name/gap-analysis.md"
  echo "- $memory_dir_name/quality-guardrails.md"
  echo "- $memory_dir_name/working-memory.md"
  echo "- $memory_dir_name/round-contract.md"
  echo "- $memory_dir_name/acceptance-report.md"
  echo "- $memory_dir_name/evidence-ledger.md"
  echo "- $memory_dir_name/orchestration-status.md"
  echo
  echo "# Files To Read Only If Needed"
  if [[ -n "$files_to_read" ]]; then
    printf '%s\n' "$files_to_read"
  else
    echo "- $memory_dir_name/acceptance-lessons.md"
    echo "- $memory_dir_name/decisions.md"
    echo "- $memory_dir_name/journal.md"
    echo "- $memory_dir_name/activity.jsonl"
    echo "- $memory_dir_name/inbox/index.jsonl"
  fi
  echo
  echo "# Round Contract Summary"
  echo
  coalesce_section "$round_contract_summary"
  echo
  echo "# Acceptance Report Summary"
  echo
  coalesce_section "$acceptance_report_summary"
  echo
  echo "# Release-Critical Journeys"
  echo
  coalesce_section "$release_critical_journeys"
  echo
  echo "# Evidence Gaps"
  echo
  coalesce_section "$evidence_gap_summary"
  echo
  echo "# Owed Writeback"
  echo
  coalesce_section "$owed_writeback_summary"
  echo
  echo "# Formal Handoff State"
  echo
  coalesce_section "$formal_handoff_state"
  echo
  echo "# Emergency Main-Thread Patch"
  echo
  coalesce_section "$emergency_patch_summary"
} > "$tmp_file"

mv "$tmp_file" "$handoff_file"
echo "$handoff_file"
