#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
from typing import Any
from pathlib import Path

HOME = Path.home()
SOURCE = Path(__file__).resolve().parent.parent
BASE_CONFIG = HOME / '.config' / 'opencode'
PROFILES_ROOT = HOME / '.config' / 'opencode-profiles'
HARNESS_ROOT = PROFILES_ROOT / 'harness'
HARNESS_PURE_ROOT = PROFILES_ROOT / 'harness-pure'
OMO_ROOT = PROFILES_ROOT / 'omo'
HARNESS_CFG = HARNESS_ROOT / 'opencode'
HARNESS_PURE_CFG = HARNESS_PURE_ROOT / 'opencode'
OMO_CFG = OMO_ROOT / 'opencode'
LOCAL_BIN = HOME / '.local' / 'bin'

HARNESS_SKILLS = [
    'control','drive','check','plan','memory','feature-planner','capability-planner',
    'browser-agent','code-agent','shell-agent','evidence-agent','docs-agent',
    'ui-probe-agent','api-probe-agent','regression-probe-agent','artifact-probe-agent'
]
HARNESS_HOOKS = [
    'evidence-verifier.js','features-json-guard.js','manager-boundary-guard.js',
    'summary-sync-guard.js','probe-evidence-guard.js','managed-route-completeness-guard.js'
]
HARNESS_AGENTS = [
    'harness-orchestrator.md','feature-planner.md','capability-planner.md',
    'planning-manager.md','execution-manager.md','acceptance-manager.md'
]
HARNESS_AGENT_KEYS = [
    'harness-orchestrator','planning-manager','execution-manager','acceptance-manager',
    'capability-hand','probe-agent'
]


def copy_tree(src: Path, dst: Path):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, symlinks=True)


def ensure_parent(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)


def load_json_object(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if path.exists():
        return json.loads(path.read_text())
    return dict(default)


def sanitize_harness_pure_profile():
    opencode_json = HARNESS_PURE_CFG / 'opencode.json'
    data = load_json_object(opencode_json, {"$schema": "https://opencode.ai/config.json"})
    data['plugin'] = [str(SOURCE / 'plugin')]
    opencode_json.write_text(json.dumps(data, indent=2) + '\n')


def sanitize_omo_profile():
    opencode_json = OMO_CFG / 'opencode.json'
    data = load_json_object(opencode_json, {"$schema": "https://opencode.ai/config.json"})
    plugins = [p for p in data.get('plugin', []) if p != str(SOURCE / 'plugin')]
    if 'oh-my-openagent@latest' not in plugins:
        plugins.append('oh-my-openagent@latest')
    data['plugin'] = plugins
    opencode_json.write_text(json.dumps(data, indent=2) + '\n')

    agent_cfg = OMO_CFG / 'oh-my-openagent.json'
    if agent_cfg.exists():
        data = json.loads(agent_cfg.read_text())
        agents = data.get('agents', {})
        for key in HARNESS_AGENT_KEYS:
            agents.pop(key, None)
        data['agents'] = agents
        agent_cfg.write_text(json.dumps(data, indent=2) + '\n')

    for rel_dir, names in [('skills', HARNESS_SKILLS), ('hooks', HARNESS_HOOKS), ('agents/agent', HARNESS_AGENTS)]:
        root = OMO_CFG / rel_dir
        for name in names:
            p = root / name
            if p.exists() or p.is_symlink():
                if p.is_dir() and not p.is_symlink():
                    shutil.rmtree(p)
                else:
                    p.unlink()


def install_harness_profile():
    env = os.environ.copy()
    env.update({
        'OPENCODE_SKILLS_DIR': str(HARNESS_CFG / 'skills'),
        'OPENCODE_AGENTS_DIR': str(HARNESS_CFG / 'agents' / 'agent'),
        'OPENCODE_HOOKS_DIR': str(HARNESS_CFG / 'hooks'),
        'OPENCODE_CONFIG_FILE': str(HARNESS_CFG / 'oh-my-opencode.json'),
        'OPENCODE_MAIN_CONFIG_FILE': str(HARNESS_CFG / 'opencode.json'),
        'OMO_AGENT_CONFIG_FILE': str(HARNESS_CFG / 'oh-my-openagent.json'),
    })
    subprocess.run([str(SOURCE / 'setup.sh')], check=True, cwd=str(SOURCE), env=env)


def write_launcher(path: Path, profile_root: Path):
    ensure_parent(path)
    content = f'''#!/bin/bash
set -euo pipefail
export XDG_CONFIG_HOME={str(profile_root)}
exec opencode "$@"
'''
    path.write_text(content)
    path.chmod(0o755)


def main():
    PROFILES_ROOT.mkdir(parents=True, exist_ok=True)
    copy_tree(BASE_CONFIG, HARNESS_CFG)
    copy_tree(BASE_CONFIG, HARNESS_PURE_CFG)
    copy_tree(BASE_CONFIG, OMO_CFG)
    sanitize_harness_pure_profile()
    sanitize_omo_profile()
    install_harness_profile()

    LOCAL_BIN.mkdir(parents=True, exist_ok=True)
    write_launcher(LOCAL_BIN / 'opencode-harness', HARNESS_ROOT)
    write_launcher(LOCAL_BIN / 'opencode-harness-pure', HARNESS_PURE_ROOT)
    write_launcher(LOCAL_BIN / 'opencode-omo', OMO_ROOT)

    print('Created profiles:')
    print(f'  Harness:      {HARNESS_CFG}')
    print(f'  Harness-pure: {HARNESS_PURE_CFG}')
    print(f'  OMO:          {OMO_CFG}')
    print('Launchers:')
    print(f'  {LOCAL_BIN / "opencode-harness"}')
    print(f'  {LOCAL_BIN / "opencode-harness-pure"}')
    print(f'  {LOCAL_BIN / "opencode-omo"}')


if __name__ == '__main__':
    main()
