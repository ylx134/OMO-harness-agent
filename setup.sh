#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$SOURCE_DIR/plugin"
SKILLS_DIR="${OPENCODE_SKILLS_DIR:-$HOME/.config/opencode/skills}"
AGENTS_DIR="${OPENCODE_AGENTS_DIR:-$HOME/.config/opencode/agents/agent}"
# Assumption: OpenCode/OMO custom hooks live under ~/.config/opencode/hooks unless the user
# overrides OPENCODE_HOOKS_DIR. Keep this idempotent and non-destructive.
HOOKS_DIR="${OPENCODE_HOOKS_DIR:-$HOME/.config/opencode/hooks}"
CONFIG_FILE="${OPENCODE_CONFIG_FILE:-$HOME/.config/opencode/oh-my-opencode.json}"
OPENCODE_MAIN_CONFIG_FILE="${OPENCODE_MAIN_CONFIG_FILE:-$HOME/.config/opencode/opencode.json}"
OPENCODE_CONFIG_DIR="$(dirname "$OPENCODE_MAIN_CONFIG_FILE")"
OMO_AGENT_CONFIG_FILE="${OMO_AGENT_CONFIG_FILE:-$HOME/.config/opencode/oh-my-openagent.json}"

SKILLS=(
  "control"
  "drive"
  "check"
  "plan"
  "memory"
  "feature-planner"
  "capability-planner"
  "browser-agent"
  "code-agent"
  "shell-agent"
  "evidence-agent"
  "docs-agent"
  "ui-probe-agent"
  "api-probe-agent"
  "regression-probe-agent"
  "artifact-probe-agent"
)

HOOKS=(
  "evidence-verifier.js"
  "features-json-guard.js"
  "manager-boundary-guard.js"
  "summary-sync-guard.js"
  "probe-evidence-guard.js"
  "managed-route-completeness-guard.js"
  "schema-guard.js"
  "summary-supervision-guard.js"
  "command-interceptor.js"
)

HARNESS_AGENT_FILES=(
  "harness-orchestrator.md"
  "feature-planner.md"
  "capability-planner.md"
  "planning-manager.md"
  "execution-manager.md"
  "acceptance-manager.md"
)

echo -e "${GREEN}🚀 Installing OMO Harness Skills managed-agents integration...${NC}"

mkdir -p "$SKILLS_DIR" "$AGENTS_DIR" "$HOOKS_DIR" "$OPENCODE_CONFIG_DIR" "$(dirname "$CONFIG_FILE")"

if [ -d "$PLUGIN_DIR" ]; then
  echo -e "  ✅ plugin source present: $PLUGIN_DIR"
  npm --prefix "$PLUGIN_DIR" run build >/dev/null 2>&1 || {
    echo -e "  ${RED}❌ failed to build local plugin package from $PLUGIN_DIR${NC}"
    exit 1
  }
  echo -e "  ✅ built local plugin package: omo-harness-plugin"
  (
    cd "$OPENCODE_CONFIG_DIR"
    npm install --no-save "$PLUGIN_DIR" >/dev/null 2>&1 || {
      echo -e "  ${RED}❌ failed to install local plugin package from $PLUGIN_DIR${NC}"
      exit 1
    }
  )
  echo -e "  ✅ installed local plugin package: omo-harness-plugin"
else
  echo -e "  ${RED}❌ plugin directory missing: $PLUGIN_DIR${NC}"
  exit 1
fi

for skill in "${SKILLS[@]}"; do
  if [ -d "$SOURCE_DIR/$skill" ]; then
    ln -sfn "$SOURCE_DIR/$skill" "$SKILLS_DIR/$skill"
    echo -e "  ✅ linked skill: $skill"
  else
    echo -e "  ${YELLOW}⚠️  skill not present in this checkout, skipped: $skill${NC}"
  fi
done

for hook in "${HOOKS[@]}"; do
  if [ -f "$SOURCE_DIR/hooks/$hook" ]; then
    ln -sfn "$SOURCE_DIR/hooks/$hook" "$HOOKS_DIR/$hook"
    echo -e "  ✅ linked hook: $hook"
  else
    echo -e "  ${YELLOW}⚠️  hook not present in this checkout, skipped: $hook${NC}"
  fi
done

for agent_file in "${HARNESS_AGENT_FILES[@]}"; do
  if [ -f "$SOURCE_DIR/agents/agent/$agent_file" ]; then
    ln -sfn "$SOURCE_DIR/agents/agent/$agent_file" "$AGENTS_DIR/$agent_file"
    echo -e "  ✅ linked harness agent file: $agent_file"
  else
    echo -e "  ${YELLOW}⚠️  harness agent file missing, skipped: $agent_file${NC}"
  fi
done

if [ -f "$SOURCE_DIR/oh-my-opencode.json" ]; then
  python3 - "$CONFIG_FILE" "$SOURCE_DIR/oh-my-opencode.json" "$HOOKS_DIR" <<'PY'
import json
import os
import sys

config_path, new_path, hooks_dir = sys.argv[1:4]

if os.path.exists(config_path):
    with open(config_path) as f:
        config = json.load(f)
else:
    config = {}

with open(new_path) as f:
    new_cfg = json.load(f)

config.setdefault('categories', {}).update(new_cfg.get('categories', {}))
config.setdefault('experimental', {}).update(new_cfg.get('experimental', {}))

if 'hooks' in new_cfg:
    config.setdefault('hooks', {})
    config['hooks'].update(new_cfg['hooks'])
    config['hooks']['install_dir_hint'] = hooks_dir

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

print('  ✅ merged oh-my-opencode.json')
PY
else
  echo -e "  ${YELLOW}⚠️  oh-my-opencode.json not found, skipped config merge${NC}"
fi

python3 - "$OPENCODE_MAIN_CONFIG_FILE" "$PLUGIN_DIR" <<'PY'
import json
import os
import sys

config_path, plugin_dir = sys.argv[1:3]
if os.path.exists(config_path):
    with open(config_path) as f:
        config = json.load(f)
else:
    config = {"$schema": "https://opencode.ai/config.json"}
plugins = config.setdefault('plugin', [])
plugins = [p for p in plugins if p != 'omo-harness-plugin' and p != plugin_dir]
plugins.append(plugin_dir)
config['plugin'] = plugins
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
print(f'  ✅ registered local harness plugin path in opencode.json: {plugin_dir}')
PY

if [ -f "$SOURCE_DIR/oh-my-openagent.harness.json" ]; then
  python3 - "$OMO_AGENT_CONFIG_FILE" "$SOURCE_DIR/oh-my-openagent.harness.json" <<'PY'
import json
import os
import sys

config_path, new_path = sys.argv[1:3]

if os.path.exists(config_path):
    with open(config_path) as f:
        config = json.load(f)
else:
    config = {}

with open(new_path) as f:
    new_cfg = json.load(f)

config.setdefault('agents', {}).update(new_cfg.get('agents', {}))

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

print('  ✅ merged harness agents into oh-my-openagent.json')
PY
else
  echo -e "  ${YELLOW}⚠️  oh-my-openagent.harness.json not found, skipped harness-agent merge${NC}"
fi

# ── Harness Observability CLI ──────────────────────────────────────
HCTL_DST="${HOME}/.local/bin/hctl"
mkdir -p "$(dirname "$HCTL_DST")"
ln -sfn "$SOURCE_DIR/scripts/harness" "$HCTL_DST"
echo -e "  ✅ linked observability CLI: hctl → $HCTL_DST"

# ── Harness Launcher ──────────────────────────────────────────────
HARNESS_LAUNCHER_DST="${HOME}/.local/bin/harness"
ln -sfn "$SOURCE_DIR/scripts/harness-launcher" "$HARNESS_LAUNCHER_DST"
echo -e "  ✅ linked harness launcher: harness → $HARNESS_LAUNCHER_DST"

# ── Schema files ──────────────────────────────────────────────────
if [ -d "$SOURCE_DIR/hooks/schemas" ]; then
  ln -sfn "$SOURCE_DIR/hooks/schemas" "$HOOKS_DIR/schemas"
  echo -e "  ✅ linked schema definitions: hooks/schemas/"
fi

# ── Harness-pure isolated profile (harness command uses this) ─────
HARNESS_PURE_DIR="${HOME}/.config/opencode-profiles/harness-pure/opencode"
mkdir -p "$HARNESS_PURE_DIR/skills" "$HARNESS_PURE_DIR/hooks" "$HARNESS_PURE_DIR/agents/agent" "$HARNESS_PURE_DIR/plugins"

# Write opencode.json: OMO for task() engine, harness plugin loaded from plugins/ directory
python3 - "$HARNESS_PURE_DIR/opencode.json" <<'PY'
import json, sys
config_path = sys.argv[1]
data = {"$schema": "https://opencode.ai/config.json", "plugin": []}
with open(config_path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
print(f'  ✅ wrote harness-pure opencode.json')
PY

# Local plugin entry (OpenCode auto-discovers .js files in plugins/ directory)
cat > "$HARNESS_PURE_DIR/plugins/harness-plugin.js" << PLUGINEOF
import { server } from "${SOURCE_DIR}/plugin/dist/index.js"
export { server }
PLUGINEOF
echo -e "  ✅ created harness plugin entry: plugins/harness-plugin.js"

# Symlink skills into harness-pure
for skill in "${SKILLS[@]}"; do
  ln -sfn "$SOURCE_DIR/$skill" "$HARNESS_PURE_DIR/skills/$skill" 2>/dev/null || true
done
echo -e "  ✅ linked ${#SKILLS[@]} skills into harness-pure"

# Symlink hooks into harness-pure
for hook in "${HOOKS[@]}"; do
  ln -sfn "$SOURCE_DIR/hooks/$hook" "$HARNESS_PURE_DIR/hooks/$hook" 2>/dev/null || true
done
ln -sfn "$SOURCE_DIR/hooks/schemas" "$HARNESS_PURE_DIR/hooks/schemas" 2>/dev/null || true
echo -e "  ✅ linked hooks into harness-pure"

# Symlink agent files into harness-pure
for agent_file in "${HARNESS_AGENT_FILES[@]}"; do
  ln -sfn "$SOURCE_DIR/agents/agent/$agent_file" "$HARNESS_PURE_DIR/agents/agent/$agent_file" 2>/dev/null || true
done
echo -e "  ✅ linked agent files into harness-pure"

echo -e "${GREEN}🎉 Installation complete.${NC}"
echo -e "${GREEN}   Launch:  harness .          (start harness mode)${NC}"
echo -e "${GREEN}   Monitor: hctl status        (inspect runtime state)${NC}"
