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
HOOKS_DIR="${OPENCODE_HOOKS_DIR:-$HOME/.config/opencode/hooks}"
CONFIG_FILE="${OPENCODE_CONFIG_FILE:-$HOME/.config/opencode/oh-my-opencode.json}"
OPENCODE_MAIN_CONFIG_FILE="${OPENCODE_MAIN_CONFIG_FILE:-$HOME/.config/opencode/opencode.json}"
OPENCODE_CONFIG_DIR="$(dirname "$OPENCODE_MAIN_CONFIG_FILE")"
OMO_AGENT_CONFIG_FILE="${OMO_AGENT_CONFIG_FILE:-$HOME/.config/opencode/oh-my-openagent.json}"
INSTALL_STATE_FILE="${OPENCODE_CONFIG_DIR}/.omo-harness-install-state.json"

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
)

HARNESS_AGENT_FILES=(
  "harness-orchestrator.md"
  "feature-planner.md"
  "capability-planner.md"
  "planning-manager.md"
  "execution-manager.md"
  "acceptance-manager.md"
)

echo -e "${RED}🗑️  Uninstalling OMO Harness Skills managed-agents integration...${NC}"

RESTORED_FROM_SNAPSHOT=0

for skill in "${SKILLS[@]}"; do
  target="$SKILLS_DIR/$skill"
  if [ -L "$target" ]; then
    rm "$target"
    echo -e "  ✅ removed skill link: $skill"
  elif [ -d "$target" ]; then
    echo -e "  ${YELLOW}⚠️  $skill is not a symlink, skipped${NC}"
  else
    echo -e "  ${YELLOW}⚠️  skill not found, skipped: $skill${NC}"
  fi
done

for hook in "${HOOKS[@]}"; do
  target="$HOOKS_DIR/$hook"
  if [ -L "$target" ]; then
    rm "$target"
    echo -e "  ✅ removed hook link: $hook"
  elif [ -f "$target" ]; then
    echo -e "  ${YELLOW}⚠️  $hook is not a symlink, skipped${NC}"
  else
    echo -e "  ${YELLOW}⚠️  hook not found, skipped: $hook${NC}"
  fi
done

for agent_file in "${HARNESS_AGENT_FILES[@]}"; do
  target="$AGENTS_DIR/$agent_file"
  if [ -L "$target" ]; then
    rm "$target"
    echo -e "  ✅ removed harness agent file link: $agent_file"
  elif [ -f "$target" ]; then
    echo -e "  ${YELLOW}⚠️  $agent_file is not a symlink, skipped${NC}"
  else
    echo -e "  ${YELLOW}⚠️  harness agent file not found, skipped: $agent_file${NC}"
  fi
done

if [ -d "$PLUGIN_DIR" ]; then
  (
    cd "$OPENCODE_CONFIG_DIR"
    npm uninstall omo-harness-plugin >/dev/null 2>&1 || true
  )
  echo -e "  ✅ removed local plugin package: omo-harness-plugin"
fi

if [ -f "$INSTALL_STATE_FILE" ]; then
  python3 - "$INSTALL_STATE_FILE" <<'PY'
import json
import os
import sys

snapshot_path = sys.argv[1]

with open(snapshot_path) as f:
    snapshot = json.load(f)

for file_path, entry in snapshot.get('files', {}).items():
    if entry.get('exists'):
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w') as f:
            f.write(entry.get('content') or '')
    elif os.path.exists(file_path):
        os.remove(file_path)

os.remove(snapshot_path)
print('  ✅ restored config files from install snapshot')
PY
  RESTORED_FROM_SNAPSHOT=1
elif [ -f "$CONFIG_FILE" ] && [ -f "$SOURCE_DIR/oh-my-opencode.json" ]; then
  python3 - "$CONFIG_FILE" "$SOURCE_DIR/oh-my-opencode.json" <<'PY'
import json
import os
import sys

config_path, source_cfg_path = sys.argv[1:3]

with open(config_path) as f:
    config = json.load(f)
with open(source_cfg_path) as f:
    managed = json.load(f)

removed = []

for key in managed.get('categories', {}):
    if key in config.get('categories', {}):
        del config['categories'][key]
        removed.append(f'category:{key}')

if 'model_fallback' in managed and 'model_fallback' in config:
    del config['model_fallback']
    removed.append('model_fallback')

for key in managed.get('experimental', {}):
    if key in config.get('experimental', {}):
        del config['experimental'][key]
        removed.append(f'experimental:{key}')

for key in managed.get('hooks', {}):
    if key in config.get('hooks', {}):
        del config['hooks'][key]
        removed.append(f'hooks:{key}')

if not config.get('categories'):
    config.pop('categories', None)
if not config.get('experimental'):
    config.pop('experimental', None)
if not config.get('hooks'):
    config.pop('hooks', None)

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

if removed:
    print('  ✅ removed config entries: ' + ', '.join(removed))
else:
    print('  ℹ️  no managed config entries were present')
PY
fi

if [ "$RESTORED_FROM_SNAPSHOT" -eq 0 ]; then
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
plugins = [p for p in config.get('plugin', []) if p not in ('omo-harness-plugin', plugin_dir)]
config['plugin'] = plugins
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
print('  ✅ removed harness plugin registration from opencode.json')
PY
fi

if [ "$RESTORED_FROM_SNAPSHOT" -eq 0 ] && [ -f "$OMO_AGENT_CONFIG_FILE" ] && [ -f "$SOURCE_DIR/oh-my-openagent.harness.json" ]; then
  python3 - "$OMO_AGENT_CONFIG_FILE" "$SOURCE_DIR/oh-my-openagent.harness.json" <<'PY'
import json
import sys

config_path, source_cfg_path = sys.argv[1:3]

with open(config_path) as f:
    config = json.load(f)
with open(source_cfg_path) as f:
    managed = json.load(f)

removed = []
for key in managed.get('agents', {}):
    if key in config.get('agents', {}):
        del config['agents'][key]
        removed.append(f'agent:{key}')

if not config.get('agents'):
    config.pop('agents', None)

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

if removed:
    print('  ✅ removed harness agent entries: ' + ', '.join(removed))
else:
    print('  ℹ️  no harness agent entries were present')
PY
fi

echo -e "${GREEN}🎉 Uninstall complete.${NC}"
