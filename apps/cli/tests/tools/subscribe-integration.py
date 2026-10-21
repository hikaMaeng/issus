"""Emit CLI tests and the read-only P5 composition fixture, then run without child test workers."""
from pathlib import Path
import os
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[4]
emitted = root / 'apps/cli/.cache/integration-js'
command = ['node', str(root/'node_modules/typescript/bin/tsc'), '-p', str(root/'apps/cli/tests/integration/tsconfig.json')]
result = subprocess.run(command, cwd=root)
if result.returncode:
    sys.exit(result.returncode)
source = Path('packages/issus_domain/src/server/backend/schema/0001-domain-baseline.sql')
(emitted/source).parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(root/source, emitted/source)
env = dict(os.environ, ISSUS_DELIVERY_HARNESS=(emitted/'apps/issus/tests/integration/deliveries/harness.js').as_uri())
result = subprocess.run(['node', '--test', '--test-isolation=none', *sys.argv[1:], str(emitted/'apps/cli/tests/integration/subscribe-reconnect.test.js')], cwd=root/'apps/cli', env=env)
sys.exit(result.returncode)
