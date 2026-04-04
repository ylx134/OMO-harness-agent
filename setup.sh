#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SKILLS_DIR="$HOME/.config/opencode/skills"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$HOME/.config/opencode/oh-my-opencode.json"

echo -e "${GREEN}🚀 开始配置 OMO Harness Skills...${NC}"

# 1. Create skills directory
mkdir -p "$SKILLS_DIR"

# 2. Create symlinks
SKILLS=("control" "drive" "check" "plan" "memory" "feature-planner" "capability-planner")
for skill in "${SKILLS[@]}"; do
  if [ -d "$SOURCE_DIR/$skill" ]; then
    ln -sf "$SOURCE_DIR/$skill" "$SKILLS_DIR/$skill"
    echo -e "  ✅ 已链接: $skill"
  else
    echo -e "  ${YELLOW}⚠️  未找到: $skill${NC}"
  fi
done

# 3. Merge JSON config safely
if [ -f "$SOURCE_DIR/oh-my-opencode.json" ]; then
  python3 -c "
import json, os

config_path = os.path.expanduser('$CONFIG_FILE')
new_path = '$SOURCE_DIR/oh-my-opencode.json'

config = {}
if os.path.exists(config_path):
    with open(config_path) as f:
        config = json.load(f)

with open(new_path) as f:
    new_cfg = json.load(f)

# Deep merge
config.setdefault('categories', {}).update(new_cfg.get('categories', {}))
if 'model_fallback' in new_cfg:
    config['model_fallback'] = new_cfg['model_fallback']
config.setdefault('experimental', {}).update(new_cfg.get('experimental', {}))

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print('  ✅ 已合并 oh-my-opencode.json')
"
else
  echo -e "  ${YELLOW}⚠️  未找到 oh-my-opencode.json，跳过配置合并${NC}"
fi

echo -e "${GREEN}🎉 配置完成！重启 OpenCode 即可使用 /control 等命令。${NC}"
