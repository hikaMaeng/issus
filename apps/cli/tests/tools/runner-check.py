"""Run R-owned checks and preserve exact command/exit/log evidence (no credentials)."""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[4]
CACHE = ROOT / '.cache/runner-implementation'
CACHE.mkdir(parents=True, exist_ok=True)


def main():
    env = dict(os.environ, PYTHONUTF8='1', PYTHONIOENCODING='utf-8')
    results = []
    def run(name, argv, cwd=ROOT):
        proc = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
        (CACHE / (name + '.log')).write_text(proc.stdout + proc.stderr, encoding='utf-8', newline='\n')
        results.append({'name': name, 'command': argv, 'cwd': str(cwd), 'exit': proc.returncode})
        print(name, 'exit=' + str(proc.returncode), flush=True)
        tail = (proc.stdout + proc.stderr).splitlines()[-14:]
        print('\n'.join(tail), flush=True)
        return proc.returncode
    run('lint', ['npm.cmd' if os.name == 'nt' else 'npm', 'run', 'lint', '--workspace', '@issus/cli'])
    run('standard-test', ['npm.cmd' if os.name == 'nt' else 'npm', 'test', '--workspace', '@issus/cli'])
    code = run('emit', ['node', 'node_modules/typescript/bin/tsc', '-p', 'apps/cli/tests/runner.tsconfig.json'])
    if code == 0:
        (CACHE / 'emitted/package.json').write_text('{"type":"module"}\n', encoding='utf-8')
        run('source-test', ['node', '--test', '--test-isolation=none', str(CACHE / 'emitted/commands/runner/tests/runner.test.js')])
    run('host-fake', ['node', 'apps/cli/tests/tools/runner-host.mjs'])
    # No bootstrap provider is accessed implicitly. The live script reports an explicit missing-env failure.
    run('live', ['node', 'apps/cli/tests/tools/runner-live.mjs'])
    (CACHE / 'commands.json').write_text(json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'commands': results}, indent=2) + '\n', encoding='utf-8')
    # Host standard test/native/live failures remain failures; source success does not override them.
    return 1 if any(item['exit'] for item in results) else 0


if __name__ == '__main__':
    sys.exit(main())
