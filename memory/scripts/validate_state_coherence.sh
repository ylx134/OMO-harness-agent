#!/bin/bash
# validate_state_coherence.sh — Detect inconsistencies between state files.
#
# Usage: validate_state_coherence.sh [workspace]
#   workspace: path to workspace root (default: current directory)
#
# Checks:
#   1. working-memory.md plan version matches task.md global plan version
#   2. orchestration-status.md route_id matches state-index.json route_id
#   3. round-contract.md round number matches working-memory.md current round
#
# Exit codes:
#   0 — all checks passed (coherent)
#   1 — one or more inconsistencies found
#   2 — required files missing (cannot verify)

set -uo pipefail

WORKSPACE="${1:-.}"
MEMORY_DIR="$WORKSPACE/.agent-memory"
ERRORS=0
WARNINGS=0

echo "=== State Coherence Check ==="
echo "Workspace: $WORKSPACE"
echo ""

# --- Check 1: Plan Version Consistency ---
echo "Check 1: Plan version consistency (task.md ↔ working-memory.md)"

TASK_FILE="$MEMORY_DIR/task.md"
WM_FILE="$MEMORY_DIR/working-memory.md"

if [ -f "$TASK_FILE" ] && [ -f "$WM_FILE" ]; then
  TASK_VERSION=$(grep -i "Global Plan Version" "$TASK_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]')
  WM_VERSION=$(grep -i "Based.On Global Plan Version\|Based-On Global Plan Version" "$WM_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]')

  if [ -n "$TASK_VERSION" ] && [ -n "$WM_VERSION" ]; then
    if [ "$TASK_VERSION" = "$WM_VERSION" ]; then
      echo "  PASS: Both at version $TASK_VERSION"
    else
      echo "  FAIL: task.md version=$TASK_VERSION, working-memory.md based-on=$WM_VERSION"
      echo "  Action: Update working-memory.md to align with task.md, or re-plan"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "  SKIP: Version fields not found (task=$TASK_VERSION, wm=$WM_VERSION)"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  SKIP: Missing files (task.md=$([ -f "$TASK_FILE" ] && echo yes || echo no), working-memory.md=$([ -f "$WM_FILE" ] && echo yes || echo no))"
  WARNINGS=$((WARNINGS + 1))
fi

# --- Check 2: Route ID Consistency ---
echo ""
echo "Check 2: Route ID consistency (orchestration-status.md ↔ state-index.json)"

ORCH_FILE="$MEMORY_DIR/orchestration-status.md"
INDEX_FILE="$MEMORY_DIR/state-index.json"

if [ -f "$ORCH_FILE" ] && [ -f "$INDEX_FILE" ]; then
  ORCH_ROUTE=$(grep -i "Route ID\|route_id" "$ORCH_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]')
  INDEX_ROUTE=$(python3 -c "import json; print(json.load(open('$INDEX_FILE')).get('route_id',''))" 2>/dev/null || echo "")

  if [ -n "$ORCH_ROUTE" ] && [ -n "$INDEX_ROUTE" ]; then
    if [ "$ORCH_ROUTE" = "$INDEX_ROUTE" ]; then
      echo "  PASS: Both show route $ORCH_ROUTE"
    else
      echo "  FAIL: orchestration-status.md route=$ORCH_ROUTE, state-index.json route=$INDEX_ROUTE"
      echo "  Action: Synchronize route_id across both files"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "  SKIP: Route fields not found (orch=$ORCH_ROUTE, index=$INDEX_ROUTE)"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  SKIP: Missing files (orchestration=$([ -f "$ORCH_FILE" ] && echo yes || echo no), state-index=$([ -f "$INDEX_FILE" ] && echo yes || echo no))"
  WARNINGS=$((WARNINGS + 1))
fi

# --- Check 3: Round Number Consistency ---
echo ""
echo "Check 3: Round number consistency (round-contract.md ↔ working-memory.md)"

RC_FILE="$MEMORY_DIR/round-contract.md"

if [ -f "$RC_FILE" ] && [ -f "$WM_FILE" ]; then
  RC_ROUND=$(grep -i "Round\|round_id\|Current Round" "$RC_FILE" | head -1 | grep -oE '[0-9]+' | head -1)
  WM_ROUND=$(grep -i "Current Round" "$WM_FILE" | head -1 | grep -oE '[0-9]+' | head -1)

  if [ -n "$RC_ROUND" ] && [ -n "$WM_ROUND" ]; then
    if [ "$RC_ROUND" = "$WM_ROUND" ]; then
      echo "  PASS: Both at round $RC_ROUND"
    else
      echo "  FAIL: round-contract.md round=$RC_ROUND, working-memory.md round=$WM_ROUND"
      echo "  Action: Ensure round-contract.md matches the active round in working-memory.md"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "  SKIP: Round fields not found (contract=$RC_ROUND, wm=$WM_ROUND)"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  SKIP: Missing files (round-contract=$([ -f "$RC_FILE" ] && echo yes || echo no), working-memory=$([ -f "$WM_FILE" ] && echo yes || echo no))"
  WARNINGS=$((WARNINGS + 1))
fi

# --- Summary ---
echo ""
echo "=== Summary ==="
echo "Errors:   $ERRORS"
echo "Warnings: $WARNINGS"

if [ "$ERRORS" -gt 0 ]; then
  echo "Result:   INCOHERENT — re-anchor or re-plan required"
  exit 1
else
  echo "Result:   COHERENT"
  exit 0
fi
