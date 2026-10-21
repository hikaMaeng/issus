"""Compare real Python and built Node CLI executables against a read-only HTTP contract fixture."""
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from contextlib import nullcontext
from threading import Thread
import argparse
import hashlib
import json
import os
import subprocess
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[4]
FIXTURES = ROOT / 'packages/issus_domain/tests/fixtures/issue-board-v2'
SKILL = Path(os.environ.get('ISSUS_REFERENCE_SKILL', r'C:\Users\hika0\.claude\skills\issue-board-collab'))
DUMMY = 'dummy-binary-contract-value'


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, value):
        payload = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == '/v1/repos/hikaMaeng/issus/issues/1':
            self.reply(200, {'revision': 7})
        else:
            self.reply(404, {'error': {'code': 'NOT_FOUND'}, 'posted': False})

    def do_POST(self):
        if not self.path.endswith('/preflight'):
            self.server.mutations += 1
            return self.reply(503, {'error': {'code': 'UNEXPECTED_MUTATION'}, 'posted': False})
        if self.headers.get('Authorization') != 'Bearer ' + DUMMY or self.headers.get('Idempotency-Key'):
            return self.reply(401, {'error': {'code': 'PREFLIGHT_HEADERS'}, 'posted': False})
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if data['mode'] == 'issue-body' and self.headers.get('If-Match') != '"7"':
            return self.reply(412, {'error': {'code': 'REVISION'}, 'posted': False})
        self.server.preflights += 1
        self.reply(200, {'valid': True, 'posted': False, 'mode': data['mode'], 'chars': len(data['request']['body']), 'envelope': {},
                         'context': {'checkedAt': '2026-10-21T06:00:00Z'}, 'compact': {'due': False, 'count': 0, 'chars': 0}})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    rows = json.loads((FIXTURES / 'python-results.json').read_text(encoding='utf-8'))
    rows = [r for r in rows if r['path'].startswith(('good/', 'bad/'))]
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.preflights = server.mutations = 0
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with nullcontext(ROOT / '.cache/p7/binary-fixtures' / str(uuid4())) as directory:
            directory = Path(directory)
            directory.mkdir(parents=True, exist_ok=False)
            packet = directory / 'packet.md'
            Path(str(packet) + '.meta.json').write_text(json.dumps({'packetToken': '00000000-0000-4000-8000-000000000099'}), encoding='utf-8')
            unicode_file = directory / '입력 공백 😀.md'
            with unicode_file.open('w', encoding='utf-8', newline='') as file:
                file.write('FROM:issus-1-client/s1 TO:ALL TYPE:NOTE\r\n한글 😀\r\n')
            rows.append({'path': 'supplement/Windows-UTF8-CRLF', 'file': str(unicode_file), 'mode': 'comment', 'exitCode': 0})
            env = {**os.environ, 'PYTHONUTF8': '1', 'ISSUS_URL': f'http://127.0.0.1:{server.server_port}', 'ISSUS_TOKEN': DUMMY,
                   'ISSUS_CONFIG_DIR': str(directory / 'isolated-config'), 'ISSUS_PROFILES_FILE': str(directory / 'absent-profiles.json')}

            def compare(row):
                file = row.get('file') or str(FIXTURES / row['path'])
                options = ['--repo', 'hikaMaeng/issus', '--issue', '1', '--body-file', file, '--dry-run']
                if row['mode'] == 'issue-body':
                    options.append('--edit-body')
                python = subprocess.run([sys.executable, str(SKILL / 'scripts/issue_post.py'), *options], capture_output=True, text=True, encoding='utf-8', env=env)
                if row['path'] == 'good/compact.md':
                    options += ['--packet-file', str(packet), '--sampled', '6272300100,6271400900,6272000500', '--compacted-by', 'p4-24-compact']
                cli = subprocess.run(['node', str(ROOT / 'apps/cli/dist/index.js'), 'post', *options], capture_output=True, text=True, encoding='utf-8', env=env)
                equal = python.stdout == cli.stdout and python.returncode == cli.returncode == row['exitCode']
                return {'path': row['path'], 'mode': row['mode'], 'pythonExit': python.returncode, 'cliExit': cli.returncode,
                        'stdoutEqual': python.stdout == cli.stdout, 'pythonStdoutSha256': hashlib.sha256(python.stdout.encode()).hexdigest(),
                        'cliStdoutSha256': hashlib.sha256(cli.stdout.encode()).hexdigest(), 'pass': equal}

            # Runs actual process boundaries while bounding parallelism; the mock server never queues work.
            with ThreadPoolExecutor(max_workers=3) as pool:
                results = list(pool.map(compare, rows))
            summary = {'cases': len(results), 'pass': sum(r['pass'] for r in results), 'fail': sum(not r['pass'] for r in results),
                       'preflights': server.preflights, 'mutations': server.mutations, 'results': results}
            target = Path(args.out)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
            print(f"binary parity cases={summary['cases']} pass={summary['pass']} fail={summary['fail']} preflights={summary['preflights']} mutations={summary['mutations']}")
            if summary['fail'] or server.mutations or server.preflights != 33:
                return 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    return 0


if __name__ == '__main__':
    sys.exit(main())
