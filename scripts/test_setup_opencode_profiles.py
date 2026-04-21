import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = REPO_ROOT / 'scripts' / 'setup-opencode-profiles.py'


class SetupOpenCodeProfilesTest(unittest.TestCase):
    def test_profile_setup_uses_current_checkout_path(self):
        with tempfile.TemporaryDirectory() as temp_home:
            home = Path(temp_home)
            opencode_dir = home / '.config' / 'opencode'
            opencode_dir.mkdir(parents=True, exist_ok=True)
            (opencode_dir / 'opencode.json').write_text('{"$schema":"https://opencode.ai/config.json"}\n')
            (opencode_dir / 'oh-my-opencode.json').write_text('{}\n')
            (opencode_dir / 'oh-my-openagent.json').write_text('{}\n')

            result = subprocess.run(
                [sys.executable, str(SCRIPT_PATH)],
                cwd=str(REPO_ROOT),
                env={**os.environ, 'HOME': str(home)},
                capture_output=True,
                text=True,
            )

            self.assertEqual(
                result.returncode,
                0,
                msg=f'stdout:\n{result.stdout}\n\nstderr:\n{result.stderr}',
            )

            harness_pure = home / '.config' / 'opencode-profiles' / 'harness-pure' / 'opencode' / 'opencode.json'
            self.assertTrue(harness_pure.exists(), msg='harness-pure profile config was not created')
            harness_pure_cfg = json.loads(harness_pure.read_text())
            self.assertEqual(harness_pure_cfg['plugin'], [str(REPO_ROOT / 'plugin')])


if __name__ == '__main__':
    unittest.main()
