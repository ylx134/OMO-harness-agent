#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SKILLS_DIR="$HOME/.config/opencode/skills"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$HOME/.config/opencode/oh-my-opencode.json"

echo -e "${RED}🗑️  开始卸载 OMO Harness Skills...${NC}"

SKILLS=("control" "drive" "check" "plan" "memory" "feature-planner" "capability-planner")

for skill in "${SKILLS[@]}"; do
  if [ -L "$SKILLS_DIR/$skill" ]; then
    rm "$SKILLS_DIR/$skill"
    echo -e "  ✅ 已移除链接: $skill"
  elif [ -d "$SKILLS_DIR/$skill" ]; then
    echo -e "  ${YELLOW}⚠️  $skill 不是软链接，跳过（可能是手动安装的）${NC}"
  else
    echo -e "  ${YELLOW}⚠️  未找到: $skill，跳过${NC}"
  fi
done

if [ -f "$CONFIG_FILE" ]; then
  python3 -c "
import json, os

config_path = os.path.expanduser('$CONFIG_FILE')
source_dir = '$SOURCE_DIR'

config = {}
if os.path.exists(config_path):
    with open(config_path) as f:
        config = json.load(f)

new_cfg = {}
if os.path.exists(os.path.join(source_dir, 'oh-my-opencode.json')):
    with open(os.path.join(source_dir, 'oh-my-opencode.json')) as f:
        new_cfg = json.load(f)

removed = []

for key in new_cfg.get('categories', {}):
    if key in config.get('categories', {}):
        del config['categories'][key]
        removed.append(f'category:{key}')

if 'model_fallback' in new_cfg and 'model_fallback' in config:
    del config['model_fallback']
    removed.append('model_fallback')

for key in new_cfg.get('experimental', {}):
    if key in config.get('experimental', {}):
        del config['experimental'][key]
        removed.append(f'experimental:{key}')

if not config.get('categories'):
    config.pop('categories', None)
if not config.get('experimental'):
    config.pop('experimental', None)

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

if removed:
    print(f'  ✅ 已移除配置: {', '.join(removed)}')
else:
    print('  ℹ️  未找到可移除的配置项')
"
fi

echo -e "${GREEN}🎉 卸载完成。${NC}"
