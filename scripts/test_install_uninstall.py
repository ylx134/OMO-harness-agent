import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SETUP_SCRIPT = REPO_ROOT / 'setup.sh'
UNINSTALL_SCRIPT = REPO_ROOT / 'uninstall.sh'


class InstallUninstallGuardrailsTest(unittest.TestCase):
    def test_setup_and_uninstall_restore_foreign_config(self):
        with tempfile.TemporaryDirectory() as temp_home:
            home = Path(temp_home)
            opencode_dir = home / '.config' / 'opencode'
            opencode_dir.mkdir(parents=True, exist_ok=True)

            original_main = {
                '$schema': 'https://opencode.ai/config.json',
                'plugin': ['foreign-plugin'],
            }
            original_opencode = {
                'categories': {
                    'foreign': {'description': 'keep me'},
                },
                'model_fallback': False,
                'experimental': {
                    'foreign_flag': True,
                },
                'hooks': {
                    'foreign_hook': {'command': 'keep me'},
                },
            }
            original_agents = {
                'agents': {
                    'foreign-agent': {'model': 'foreign/model'},
                },
            }

            (opencode_dir / 'opencode.json').write_text(json.dumps(original_main, indent=2) + '\n')
            (opencode_dir / 'oh-my-opencode.json').write_text(json.dumps(original_opencode, indent=2) + '\n')
            (opencode_dir / 'oh-my-openagent.json').write_text(json.dumps(original_agents, indent=2) + '\n')

            env = {**os.environ, 'HOME': str(home)}

            setup_result = subprocess.run(
                [str(SETUP_SCRIPT)],
                cwd=str(REPO_ROOT),
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                setup_result.returncode,
                0,
                msg=f'setup stdout:\n{setup_result.stdout}\n\nsetup stderr:\n{setup_result.stderr}',
            )

            uninstall_result = subprocess.run(
                [str(UNINSTALL_SCRIPT)],
                cwd=str(REPO_ROOT),
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                uninstall_result.returncode,
                0,
                msg=f'uninstall stdout:\n{uninstall_result.stdout}\n\nuninstall stderr:\n{uninstall_result.stderr}',
            )

            final_main = json.loads((opencode_dir / 'opencode.json').read_text())
            final_opencode = json.loads((opencode_dir / 'oh-my-opencode.json').read_text())
            final_agents = json.loads((opencode_dir / 'oh-my-openagent.json').read_text())

            self.assertEqual(final_main, original_main)
            self.assertEqual(final_opencode, original_opencode)
            self.assertEqual(final_agents, original_agents)


if __name__ == '__main__':
    unittest.main()
