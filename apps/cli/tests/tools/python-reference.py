"""Read-only canonical Python oracle. Never calls gh or reads credentials."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys

BASE = Path(__file__).resolve().parents[4]
FIXTURES = BASE / 'packages/issus_domain/tests/fixtures/issue-board-v2'
SOURCE = Path(os.environ.get('ISSUS_REFERENCE_SKILL', r'C:\Users\hika0\.claude\skills\issue-board-collab')) / 'scripts'


def posts():
    expected = json.loads((FIXTURES / 'python-results.json').read_text(encoding='utf-8'))
    results = []
    for row in expected:
        if not row['path'].startswith(('good/', 'bad/')):
            continue
        file = str(FIXTURES / row['path'])
        args = [sys.executable, str(SOURCE / 'issue_post.py'), '--repo', 'hikaMaeng/issus', '--issue', '1', '--body-file', file, '--dry-run']
        if row['mode'] == 'issue-body':
            args.append('--edit-body')
        result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', env={**os.environ, 'PYTHONUTF8': '1'})
        results.append({**row, 'file': file, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    print(json.dumps(results, ensure_ascii=False))


def watch():
    spec = importlib.util.spec_from_file_location('canonical_watch', SOURCE / 'issue_watch.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fixture = json.loads((BASE / 'apps/cli/tests/fixtures/watch.json').read_text(encoding='utf-8'))

    def gh_json(args):
        path = next(x for x in args if x.startswith('repos/'))
        if '/comments' in path:
            number = path.split('/issues/')[1].split('/')[0]
            comments = fixture['issues'][number]['comments']
            page = int(next((x.split('=')[1] for x in args if x.startswith('page=')), '1'))
            return sorted(comments, key=lambda c: c['id'], reverse=True)[(page - 1) * 100:page * 100]
        return [fixture['issues'][path.split('/')[-1]]]

    module.gh_json = gh_json
    sys.argv = ['issue_watch.py', '--repo', fixture['repo'], '--me', 'issus-1-client', '--mine', '작성: issus-1-old / s2 | legacy', '--since-compact', '--peek', '1']
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        module.main()
    print(output.getvalue(), end='')


if __name__ == '__main__':
    mode = sys.argv[1]
    if '--out' in sys.argv:
        path = Path(sys.argv[sys.argv.index('--out') + 1])
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            posts() if mode == 'post' else watch()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(buffer.getvalue(), encoding='utf-8', newline='\n')
        print(f'canonical {mode} results saved: {path}')
    else:
        posts() if mode == 'post' else watch()
