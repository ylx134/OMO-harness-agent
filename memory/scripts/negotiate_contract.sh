#!/bin/bash
# negotiate_contract.sh — Manage contract negotiation turn-taking between executor and checker.
#
# Usage: negotiate_contract.sh <action> [workspace]
#   action:    validate | advance | status
#   workspace: path to workspace root (default: current directory)
#
# Actions:
#   validate  — Check if round-contract.md has all required fields
#   advance   — Toggle Expected Next Writer between executor↔checker, increment negotiation round
#   status    — Show current negotiation state
#
# Exit codes:
#   0 — success
#   1 — validation failed or max rounds exceeded
#   2 — missing files

set -uo pipefail

ACTION="${1:?Usage: negotiate_contract.sh <action> [workspace]}"
WORKSPACE="${2:-.}"
MEMORY_DIR="$WORKSPACE/.agent-memory"
CONTRACT_FILE="$MEMORY_DIR/round-contract.md"
ORCH_FILE="$MEMORY_DIR/orchestration-status.md"
ACTIVITY_FILE="$MEMORY_DIR/activity.jsonl"
MAX_ROUNDS=3

# --- Helpers ---

get_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log_activity() {
  local event_type="$1"
  local summary="$2"
  if [ -f "$ACTIVITY_FILE" ]; then
    echo "{\"time\": \"$(get_timestamp)\", \"event_type\": \"$event_type\", \"summary\": \"$summary\"}" >> "$ACTIVITY_FILE"
  fi
}

get_negotiation_round() {
  if [ -f "$ORCH_FILE" ]; then
    local round=$(grep -i "Negotiation Round" "$ORCH_FILE" | head -1 | grep -oE '[0-9]+' | head -1)
    echo "${round:-0}"
  else
    echo "0"
  fi
}

get_expected_writer() {
  if [ -f "$ORCH_FILE" ]; then
    grep -i "Expected Next Writer" "$ORCH_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]'
  fi
}

# --- Actions ---

do_validate() {
  if [ ! -f "$CONTRACT_FILE" ]; then
    echo "ERROR: round-contract.md not found" >&2
    exit 2
  fi

  local missing=()
  local content
  content=$(cat "$CONTRACT_FILE")

  # Check required sections (case-insensitive)
  grep -qi "round goal\|what this round will do\|what this round does" "$CONTRACT_FILE" || missing+=("Round goal")
  grep -qi "checklist\|pass condition" "$CONTRACT_FILE" || missing+=("Checklist with pass conditions")
  grep -qi "evidence\|proof" "$CONTRACT_FILE" || missing+=("Required evidence types")
  grep -qi "scope\|files in scope" "$CONTRACT_FILE" || missing+=("Files in scope")

  if [ ${#missing[@]} -eq 0 ]; then
    echo "VALID: round-contract.md has all required fields"
    exit 0
  else
    echo "INVALID: round-contract.md is missing required fields:" >&2
    for field in "${missing[@]}"; do
      echo "  - $field" >&2
    done
    echo "" >&2
    echo "Executor must add these fields before checker can review." >&2
    exit 1
  fi
}

do_advance() {
  if [ ! -f "$ORCH_FILE" ]; then
    echo "ERROR: orchestration-status.md not found" >&2
    exit 2
  fi

  local current_round
  current_round=$(get_negotiation_round)
  local next_round=$((current_round + 1))
  local current_writer
  current_writer=$(get_expected_writer)

  # Check max rounds
  if [ "$next_round" -gt "$MAX_ROUNDS" ]; then
    echo "MAX ROUNDS EXCEEDED: $MAX_ROUNDS negotiation rounds completed without agreement" >&2
    echo "Action: Escalate to user with latest contract draft and rejection reason" >&2
    log_activity "contract_negotiation_failed" "Max $MAX_ROUNDS rounds exceeded, escalating to user"
    exit 1
  fi

  # Toggle writer
  local next_writer
  if [ "$current_writer" = "executor" ]; then
    next_writer="checker"
  else
    next_writer="executor"
  fi

  echo "Negotiation round: $current_round -> $next_round"
  echo "Expected Next Writer: $current_writer -> $next_writer"
  echo ""
  echo "Update orchestration-status.md with:"
  echo "  Expected Next Writer: $next_writer"
  echo "  Current Phase: contract-negotiation"
  echo "  Negotiation Round: $next_round"

  log_activity "contract_negotiation_advanced" "Round $next_round, next writer: $next_writer"
  exit 0
}

do_status() {
  local round
  round=$(get_negotiation_round)
  local writer
  writer=$(get_expected_writer)

  echo "=== Contract Negotiation Status ==="
  echo "Negotiation Round: $round / $MAX_ROUNDS"
  echo "Expected Next Writer: ${writer:-unknown}"
  echo "Contract File: $([ -f "$CONTRACT_FILE" ] && echo "exists" || echo "missing")"

  if [ "$round" -ge "$MAX_ROUNDS" ]; then
    echo "Status: MAX ROUNDS REACHED — escalation required"
  elif [ -z "$writer" ]; then
    echo "Status: NOT STARTED"
  else
    echo "Status: IN PROGRESS"
  fi
}

# --- Main ---

case "$ACTION" in
  validate) do_validate ;;
  advance)  do_advance ;;
  status)   do_status ;;
  *)
    echo "Unknown action: $ACTION" >&2
    echo "Usage: negotiate_contract.sh <validate|advance|status> [workspace]" >&2
    exit 2
    ;;
esac
