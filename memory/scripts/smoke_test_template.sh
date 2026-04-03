#!/usr/bin/env bash
# Smoke Test Template
# Copy this to your project root as scripts/smoke_test.sh and customize

set -euo pipefail

WORKSPACE_ROOT="${1:-.}"
cd "$WORKSPACE_ROOT"

echo "=== Smoke Test Started at $(date) ==="

# Exit codes
EXIT_SUCCESS=0
EXIT_FAILURE=1

# Track failures
FAILURES=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"

    echo ""
    echo "Running: $test_name"
    if eval "$test_command"; then
        echo "✓ PASS: $test_name"
    else
        echo "✗ FAIL: $test_name"
        ((FAILURES++))
    fi
}

# ============================================================================
# CUSTOMIZE THESE TESTS FOR YOUR PROJECT
# ============================================================================

# Example: Web Application
# run_test "Homepage loads" "curl -f http://localhost:3000 > /dev/null 2>&1"
# run_test "API health check" "curl -f http://localhost:3000/api/health | grep -q 'ok'"

# Example: CLI Tool
# run_test "CLI help works" "./bin/my-tool --help > /dev/null"
# run_test "CLI version works" "./bin/my-tool --version | grep -q '[0-9]'"

# Example: Python Project
# run_test "Python imports work" "python -c 'import my_module'"
# run_test "Unit tests pass" "python -m pytest tests/smoke/ -v"

# Example: Node.js Project
# run_test "Node modules installed" "test -d node_modules"
# run_test "Build succeeds" "npm run build"
# run_test "Smoke tests pass" "npm run test:smoke"

# Example: File-based checks
# run_test "Config file exists" "test -f config/production.yml"
# run_test "Database migrations current" "alembic current | grep -q 'head'"

# ============================================================================
# ADD YOUR PROJECT-SPECIFIC TESTS ABOVE
# ============================================================================

echo ""
echo "=== Smoke Test Completed at $(date) ==="
echo "Total failures: $FAILURES"

if [ $FAILURES -eq 0 ]; then
    echo "✓ All smoke tests passed"
    exit $EXIT_SUCCESS
else
    echo "✗ $FAILURES smoke test(s) failed"
    exit $EXIT_FAILURE
fi
