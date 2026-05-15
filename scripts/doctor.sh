#!/bin/bash
# ─── OMO Harness Doctor ──────────────────────────────────────────
#
# Comprehensive health check for OMO Harness installation.
# Validates paths, symlinks, config, runtime, CLI, and git.
#
# Usage:
#   ./doctor.sh             Run all checks
#   ./doctor.sh --quiet     Only output failures
#   ./doctor.sh --json      Output as JSON
#
# Exit code: 0 = all healthy, 1 = issues found
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

QUIET=false
JSON_OUT=false
FAILURES=0
WARNINGS=0
PASSES=0
CHECKS_TOTAL=0
declare -a FAILURE_DETAILS=()
declare -a WARNING_DETAILS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet|-q) QUIET=true ;;
    --json|-j)  JSON_OUT=true ;;
    *) ;;
  esac
  shift
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$SOURCE_DIR/plugin"
SKILLS_DIR="${OPENCODE_SKILLS_DIR:-$HOME/.config/opencode/skills}"
AGENTS_DIR="${OPENCODE_AGENTS_DIR:-$HOME/.config/opencode/agents/agent}"
HOOKS_DIR="${OPENCODE_HOOKS_DIR:-$HOME/.config/opencode/hooks}"
HARNESS_PURE_DIR="$HOME/.config/opencode-profiles/harness-pure/opencode"
HCTL_PATH="${HOME}/.local/bin/hctl"
HARNESS_LAUNCHER_PATH="${HOME}/.local/bin/harness"

EXPECTED_SKILLS=(
  "control" "drive" "check" "plan" "memory"
  "feature-planner" "capability-planner"
  "browser-agent" "code-agent" "shell-agent"
  "evidence-agent" "docs-agent" "review-agent"
  "ui-probe-agent" "api-probe-agent"
  "regression-probe-agent" "artifact-probe-agent"
)

EXPECTED_HOOKS=(
  "evidence-verifier.js" "features-json-guard.js"
  "manager-boundary-guard.js" "summary-sync-guard.js"
  "probe-evidence-guard.js" "managed-route-completeness-guard.js"
  "schema-guard.js" "summary-supervision-guard.js"
  "output-contract-guard.js"
)

EXPECTED_AGENT_FILES=(
  "harness-orchestrator.md" "feature-planner.md"
  "capability-planner.md" "planning-manager.md"
  "execution-manager.md" "acceptance-manager.md"
  "summary-manager.md"
)

# ─── Helpers ─────────────────────────────────────────────────────

pass_check() {
  PASSES=$((PASSES + 1))
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  $QUIET || echo -e "  ${GREEN}✓${NC} $1"
}

fail_check() {
  FAILURES=$((FAILURES + 1))
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  FAILURE_DETAILS+=("$1")
  echo -e "  ${RED}✗${NC} $1"
}

warn_check() {
  WARNINGS=$((WARNINGS + 1))
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  WARNING_DETAILS+=("$1")
  echo -e "  ${YELLOW}⚠${NC} $1"
}

check_status() {
  local label="$1"; shift
  if "$@"; then
    pass_check "$label"
  else
    fail_check "$label"
  fi
}

check_warn() {
  local label="$1"; shift
  if "$@"; then
    pass_check "$label"
  else
    warn_check "$label"
  fi
}

version_ge() {
  # Returns 0 if $1 >= $2, 1 otherwise
  printf '%s\n%s\n' "$2" "$1" | sort -V -C 2>/dev/null
}

symlink_target() {
  if [[ -L "$1" ]]; then
    readlink "$1"
  else
    echo ""
  fi
}

# ─── Header ──────────────────────────────────────────────────────

$QUIET || {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║${NC}         ${CYAN}OMO Harness Doctor — Health Check${NC}               ${BOLD}║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ===================================================================
# SECTION 1: SOURCE PATHS
# ===================================================================

$QUIET || echo -e "${BOLD}── Source Paths ──${NC}"

check_status "Source directory exists" test -d "$SOURCE_DIR"

check_status "plugin/ dir exists" test -d "$PLUGIN_DIR"

check_status "plugin/package.json exists" test -f "$PLUGIN_DIR/package.json"

check_status "plugin/src/ dir exists" test -d "$PLUGIN_DIR/src"

check_status "plugin/tsconfig.build.json exists" test -f "$PLUGIN_DIR/tsconfig.build.json"

check_status "hooks/ dir exists" test -d "$SOURCE_DIR/hooks"

check_status "agents/agent/ dir exists" test -d "$SOURCE_DIR/agents/agent"

check_status "scripts/harness exists" test -f "$SOURCE_DIR/scripts/harness"

check_status "scripts/harness-launcher exists" test -f "$SOURCE_DIR/scripts/harness-launcher"

check_status "setup.sh exists" test -f "$SOURCE_DIR/setup.sh"

check_status "uninstall.sh exists" test -f "$SOURCE_DIR/uninstall.sh"

# ===================================================================
# SECTION 2: SKILL SOURCE DIRS
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Skill Source Directories ──${NC}"

for skill in "${EXPECTED_SKILLS[@]}"; do
  check_status "skill source: $skill" test -d "$SOURCE_DIR/$skill"
done

# ===================================================================
# SECTION 3: AGENT FILES SOURCE
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Agent Source Files ──${NC}"

for agent_file in "${EXPECTED_AGENT_FILES[@]}"; do
  check_status "agent source: $agent_file" test -f "$SOURCE_DIR/agents/agent/$agent_file"
done

# ===================================================================
# SECTION 4: HOOK SOURCE FILES
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Hook Source Files ──${NC}"

for hook in "${EXPECTED_HOOKS[@]}"; do
  if [[ -f "$SOURCE_DIR/hooks/$hook" ]]; then
    pass_check "hook source: $hook"
  else
    warn_check "hook source: $hook (not yet created)"
  fi
done

check_status "hook schemas dir exists" test -d "$SOURCE_DIR/hooks/schemas"

# ===================================================================
# SECTION 5: SKILL SYMLINKS
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Skill Symlinks (~/.config/opencode/skills/) ──${NC}"

check_status "skills dir exists" test -d "$SKILLS_DIR"

if [[ -d "$SKILLS_DIR" ]]; then
  for skill in "${EXPECTED_SKILLS[@]}"; do
    local link="$SKILLS_DIR/$skill"
    if [[ -L "$link" ]]; then
      local target
      target="$(symlink_target "$link")"
      if [[ -e "$link" ]]; then
        pass_check "skill symlink: $skill → ${target##*/}"
      else
        fail_check "skill symlink BROKEN: $skill → ${target:-none}"
      fi
    elif [[ -d "$link" ]]; then
      warn_check "skill exists but not symlinked: $skill"
    else
      fail_check "skill symlink MISSING: $skill"
    fi
  done
fi

# ===================================================================
# SECTION 6: HOOK SYMLINKS
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Hook Symlinks (~/.config/opencode/hooks/) ──${NC}"

check_status "hooks dir exists" test -d "$HOOKS_DIR"

if [[ -d "$HOOKS_DIR" ]]; then
  for hook in "${EXPECTED_HOOKS[@]}"; do
    local link="$HOOKS_DIR/$hook"
    if [[ -L "$link" ]]; then
      local target
      target="$(symlink_target "$link")"
      if [[ -e "$link" ]]; then
        pass_check "hook symlink: $hook → ${target##*/}"
      else
        fail_check "hook symlink BROKEN: $hook → ${target:-none}"
      fi
    elif [[ -f "$link" ]]; then
      warn_check "hook exists but not symlinked: $hook"
    else
      if [[ -f "$SOURCE_DIR/hooks/$hook" ]]; then
        warn_check "hook symlink NOT INSTALLED: $hook"
      else
        pass_check "hook not yet created: $hook"
      fi
    fi
  done
fi

# ===================================================================
# SECTION 7: AGENT FILE SYMLINKS
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Agent File Symlinks (~/.config/opencode/agents/agent/) ──${NC}"

check_status "agents dir exists" test -d "$AGENTS_DIR"

if [[ -d "$AGENTS_DIR" ]]; then
  for agent_file in "${EXPECTED_AGENT_FILES[@]}"; do
    local link="$AGENTS_DIR/$agent_file"
    if [[ -L "$link" ]]; then
      local target
      target="$(symlink_target "$link")"
      if [[ -e "$link" ]]; then
        pass_check "agent symlink: $agent_file → ${target##*/}"
      else
        fail_check "agent symlink BROKEN: $agent_file → ${target:-none}"
      fi
    elif [[ -f "$link" ]]; then
      warn_check "agent file exists but not symlinked: $agent_file"
    else
      fail_check "agent symlink MISSING: $agent_file"
    fi
  done
fi

# ===================================================================
# SECTION 8: HARNESS PURE PROFILE
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Harness-Pure Profile ──${NC}"

check_status "harness-pure dir exists" test -d "$HARNESS_PURE_DIR"

check_status "harness-pure opencode.json exists" test -f "$HARNESS_PURE_DIR/opencode.json"

check_status "harness-pure skills dir exists" test -d "$HARNESS_PURE_DIR/skills"

check_status "harness-pure hooks dir exists" test -d "$HARNESS_PURE_DIR/hooks"

check_status "harness-pure agents dir exists" test -d "$HARNESS_PURE_DIR/agents/agent"

check_status "harness-pure plugins dir exists" test -d "$HARNESS_PURE_DIR/plugins"

check_status "harness-pure plugin entry exists" test -f "$HARNESS_PURE_DIR/plugins/harness-plugin.js"

if [[ -d "$HARNESS_PURE_DIR/skills" ]]; then
  $QUIET || echo -e "  ${DIM}harness-pure skills:${NC}"
  local pure_skill_count=0
  for skill in "${EXPECTED_SKILLS[@]}"; do
    local link="$HARNESS_PURE_DIR/skills/$skill"
    if [[ -L "$link" ]]; then
      if [[ -e "$link" ]]; then
        pure_skill_count=$((pure_skill_count + 1))
      fi
    fi
  done
  if [[ $pure_skill_count -ge 16 ]]; then
    pass_check "harness-pure skills linked: $pure_skill_count"
  else
    warn_check "harness-pure skills linked: $pure_skill_count (expected >= 16)"
  fi
fi

if [[ -d "$HARNESS_PURE_DIR/hooks" ]]; then
  local pure_hook_count=0
  for hook in "${EXPECTED_HOOKS[@]}"; do
    local link="$HARNESS_PURE_DIR/hooks/$hook"
    if [[ -L "$link" ]] && [[ -e "$link" ]]; then
      pure_hook_count=$((pure_hook_count + 1))
    fi
  done
  if [[ $pure_hook_count -ge 8 ]]; then
    pass_check "harness-pure hooks linked: $pure_hook_count"
  else
    warn_check "harness-pure hooks linked: $pure_hook_count (expected >= 8)"
  fi
fi

if [[ -d "$HARNESS_PURE_DIR/agents/agent" ]]; then
  local pure_agent_count=0
  for agent_file in "${EXPECTED_AGENT_FILES[@]}"; do
    local link="$HARNESS_PURE_DIR/agents/agent/$agent_file"
    if [[ -L "$link" ]] && [[ -e "$link" ]]; then
      pure_agent_count=$((pure_agent_count + 1))
    fi
  done
  if [[ $pure_agent_count -ge 7 ]]; then
    pass_check "harness-pure agents linked: $pure_agent_count"
  else
    warn_check "harness-pure agents linked: $pure_agent_count (expected >= 7)"
  fi
fi

# ===================================================================
# SECTION 9: CONFIG FILES
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Config Files ──${NC}"

check_status "oh-my-opencode.json exists" test -f "$SOURCE_DIR/oh-my-opencode.json"

check_status "oh-my-openagent.harness.json exists" test -f "$SOURCE_DIR/oh-my-openagent.harness.json"

check_warn "opencode.json config exists" test -f "$HOME/.config/opencode/opencode.json"

check_warn "oh-my-openagent.json config exists" test -f "$HOME/.config/opencode/oh-my-openagent.json"

# ===================================================================
# SECTION 10: RUNTIME
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Runtime ──${NC}"

# Node.js
if command -v node &>/dev/null; then
  local node_ver
  node_ver="$(node -v 2>/dev/null | sed 's/^v//')"
  if version_ge "$node_ver" "18.0.0"; then
    pass_check "Node.js >= 18: v${node_ver}"
  else
    fail_check "Node.js >= 18: v${node_ver} (too old)"
  fi
else
  fail_check "Node.js not found on PATH"
fi

# npm
if command -v npm &>/dev/null; then
  local npm_ver
  npm_ver="$(npm -v 2>/dev/null)"
  pass_check "npm available: v${npm_ver}"
else
  fail_check "npm not found on PATH"
fi

# Plugin npm dependencies
if [[ -d "$PLUGIN_DIR/node_modules" ]]; then
  pass_check "plugin node_modules/ exists"
else
  warn_check "plugin node_modules/ MISSING (run: npm --prefix plugin install)"
fi

# Plugin dist
if [[ -f "$PLUGIN_DIR/dist/index.js" ]]; then
  pass_check "plugin dist/index.js exists"
else
  fail_check "plugin dist/index.js MISSING (run: npm --prefix plugin run build)"
fi

# Plugin can be required by Node.js
if [[ -f "$PLUGIN_DIR/dist/index.js" ]]; then
  if node -e "import('$PLUGIN_DIR/dist/index.js').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    pass_check "plugin dist/index.js loads without error"
  else
    warn_check "plugin dist/index.js may have import issues"
  fi
else
  fail_check "plugin require check SKIPPED (dist missing)"
fi

# ===================================================================
# SECTION 11: CLI
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── CLI ──${NC}"

check_status "hctl symlink exists" test -L "$HCTL_PATH"

if [[ -L "$HCTL_PATH" ]]; then
  local hctl_target
  hctl_target="$(symlink_target "$HCTL_PATH")"
  if [[ -e "$HCTL_PATH" ]]; then
    pass_check "hctl symlink valid → ${hctl_target##*/}"
  else
    fail_check "hctl symlink BROKEN → ${hctl_target:-none}"
  fi
else
  fail_check "hctl not found at $HCTL_PATH (run: ./setup.sh)"
fi

check_status "harness launcher symlink exists" test -L "$HARNESS_LAUNCHER_PATH"

if [[ -L "$HARNESS_LAUNCHER_PATH" ]]; then
  local harness_target
  harness_target="$(symlink_target "$HARNESS_LAUNCHER_PATH")"
  if [[ -e "$HARNESS_LAUNCHER_PATH" ]]; then
    pass_check "harness launcher symlink valid → ${harness_target##*/}"
  else
    fail_check "harness launcher symlink BROKEN → ${harness_target:-none}"
  fi
else
  fail_check "harness launcher not found at $HARNESS_LAUNCHER_PATH (run: ./setup.sh)"
fi

# hctl is executable
if [[ -x "$HCTL_PATH" ]] || [[ -x "$(readlink -f "$HCTL_PATH" 2>/dev/null || echo "")" ]]; then
  pass_check "hctl is executable"
else
  warn_check "hctl may not be executable"
fi

# hctl on PATH
if command -v hctl &>/dev/null; then
  pass_check "hctl found on PATH"
else
  local path_dir
  path_dir="$(dirname "$HCTL_PATH")"
  if [[ ":$PATH:" == *":$path_dir:"* ]]; then
    fail_check "hctl not on PATH despite being in \$PATH directory"
  else
    warn_check "hctl not on PATH (add ${path_dir} to PATH)"
  fi
fi

# hctl check succeeds (opportunistic — needs .agent-memory/)
if command -v hctl &>/dev/null; then
  local cwd_had_memory=false
  if [[ -d ".agent-memory" ]]; then
    cwd_had_memory=true
  fi
  if hctl check &>/dev/null; then
    pass_check "hctl check succeeds"
  else
    if $cwd_had_memory; then
      warn_check "hctl check returned non-zero (may need running harness session)"
    else
      pass_check "hctl check (no .agent-memory in cwd — expected)"
    fi
  fi
fi

# ===================================================================
# SECTION 12: GIT
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Git ──${NC}"

if command -v git &>/dev/null; then
  local git_ver
  git_ver="$(git --version 2>/dev/null | sed 's/git version //')"
  if version_ge "$git_ver" "2.30.0"; then
    pass_check "Git >= 2.30: v${git_ver}"
  else
    fail_check "Git >= 2.30: v${git_ver} (too old)"
  fi
else
  fail_check "Git not found on PATH"
fi

if git rev-parse --git-dir &>/dev/null; then
  pass_check "Current directory is a git repo"

  # Git origin
  if git remote get-url origin &>/dev/null; then
    local origin_url
    origin_url="$(git remote get-url origin 2>/dev/null)"
    pass_check "Git remote origin: ${origin_url##*/}"
  else
    warn_check "Git has no remote origin"
  fi

  # Clean working tree
  if git diff --quiet && git diff --cached --quiet; then
    pass_check "Git working tree is clean"
  else
    warn_check "Git working tree has uncommitted changes"
  fi
else
  fail_check "Current directory is NOT a git repo"
fi

# ===================================================================
# SECTION 13: SCHEMA FILES
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Schema Files ──${NC}"

check_status "schema: routing-table.json" test -f "$SOURCE_DIR/hooks/schemas/routing-table.schema.json"

check_status "schema: state-index.json" test -f "$SOURCE_DIR/hooks/schemas/state-index.schema.json"

check_status "schema: features.json" test -f "$SOURCE_DIR/hooks/schemas/features.schema.json"

# ===================================================================
# SECTION 14: ADDITIONAL CHECKS
# ===================================================================

$QUIET || echo ""
$QUIET || echo -e "${BOLD}── Additional Checks ──${NC}"

# Python3 (needed by setup.sh and harness script)
if command -v python3 &>/dev/null; then
  local py_ver
  py_ver="$(python3 --version 2>/dev/null | awk '{print $2}')"
  pass_check "python3 available: v${py_ver}"
else
  warn_check "python3 not found on PATH (needed by harness script)"
fi

# jq (useful for debugging)
if command -v jq &>/dev/null; then
  pass_check "jq available"
else
  warn_check "jq not found (useful for debugging, not required)"
fi

# hctl has correct content
if [[ -L "$HCTL_PATH" ]] && [[ -e "$HCTL_PATH" ]]; then
  if grep -q "Observability CLI" "$HCTL_PATH" 2>/dev/null; then
    pass_check "hctl links to harness observability CLI"
  else
    warn_check "hctl may not link to correct harness script"
  fi
fi

# Harness launcher references correct profile dir
if [[ -f "$HARNESS_LAUNCHER_PATH" ]] || [[ -L "$HARNESS_LAUNCHER_PATH" ]]; then
  if grep -q "harness-pure" "$HARNESS_LAUNCHER_PATH" 2>/dev/null; then
    pass_check "harness launcher references harness-pure profile"
  else
    warn_check "harness launcher may not reference harness-pure profile"
  fi
fi

# setup.sh is executable
if [[ -x "$SOURCE_DIR/setup.sh" ]]; then
  pass_check "setup.sh is executable"
else
  warn_check "setup.sh is not executable (chmod +x setup.sh)"
fi

# doctor.sh is executable
if [[ -x "$SOURCE_DIR/scripts/doctor.sh" ]]; then
  pass_check "doctor.sh is executable"
else
  warn_check "doctor.sh is not executable (chmod +x scripts/doctor.sh)"
fi

# ===================================================================
# SUMMARY
# ===================================================================

$QUIET || {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║${NC}              ${CYAN}Doctor Summary${NC}                              ${BOLD}║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""

  local status_color="$GREEN"
  local status_label="HEALTHY"
  if [[ $FAILURES -gt 0 ]]; then
    status_color="$RED"
    status_label="UNHEALTHY"
  elif [[ $WARNINGS -gt 0 ]]; then
    status_color="$YELLOW"
    status_label="DEGRADED"
  fi

  echo -e "  Status:     ${status_color}${status_label}${NC}"
  echo -e "  Checks:     ${CHECKS_TOTAL}"
  echo -e "  Passed:     ${GREEN}${PASSES}${NC}"
  echo -e "  Warnings:   ${YELLOW}${WARNINGS}${NC}"
  echo -e "  Failures:   ${RED}${FAILURES}${NC}"
  echo ""

  if [[ ${#FAILURE_DETAILS[@]} -gt 0 ]]; then
    echo -e "${BOLD}Failures:${NC}"
    for detail in "${FAILURE_DETAILS[@]}"; do
      echo -e "  ${RED}✗${NC} $detail"
    done
    echo ""
  fi

  if [[ ${#WARNING_DETAILS[@]} -gt 0 ]]; then
    echo -e "${BOLD}Warnings:${NC}"
    for detail in "${WARNING_DETAILS[@]}"; do
      echo -e "  ${YELLOW}⚠${NC} $detail"
    done
    echo ""
  fi

  echo -e "  ${DIM}Source: $SOURCE_DIR${NC}"
  echo ""
}

# JSON output if requested
if $JSON_OUT; then
  python3 -c "
import json
print(json.dumps({
  'status': '${status_label:-UNKNOWN}',
  'checks_total': ${CHECKS_TOTAL},
  'passed': ${PASSES},
  'warnings': ${WARNINGS},
  'failures': ${FAILURES},
  'failure_details': $(python3 -c "import json; print(json.dumps(${FAILURE_DETAILS[@]+"${FAILURE_DETAILS[@]}"} if ${#FAILURE_DETAILS[@]} > 0 else []))" 2>/dev/null || echo '[]'),
  'warning_details': $(python3 -c "import json; print(json.dumps(${WARNING_DETAILS[@]+"${WARNING_DETAILS[@]}"} if ${#WARNING_DETAILS[@]} > 0 else []))" 2>/dev/null || echo '[]'),
  'source_dir': '$SOURCE_DIR'
}, indent=2))
"
fi

# Exit with failure if any checks failed
if [[ $FAILURES -gt 0 ]]; then
  exit 1
fi

exit 0
