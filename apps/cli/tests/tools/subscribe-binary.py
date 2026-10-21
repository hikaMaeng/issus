"""C-02 built CLI process stdout/exit proof against a loopback SSE contract server."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import subprocess
import threading
import time
import uuid

root = Path(__file__).resolve().parents[4]
uid = lambda: str(uuid.uuid4())
owner, alias, session, subscription, cursor, delivery = [uid() for _ in range(6)]
channels = [f'alias:{owner}:{alias}', f'session:{session}']
principal = dict(kind='session', id=session, ownerId=owner, aliasId=alias, sessionId=session, alias='issus-1-client', sid='s2', capabilities=[])


def run_case(mode):
    waiting, emit, receipt, confirm, stop = [threading.Event() for _ in range(5)]
    mutations = []

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, *args):
            pass

        def json(self, value, status=200):
            data = json.dumps(value).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            mutations.append(self.path)
            if self.path == '/v1/subscriptions':
                self.json(dict(subscriptionId=subscription, channels=channels, cursor=cursor), 201)
            elif self.path == '/v1/deliveries/receipts':
                assert body == dict(subscriptionId=subscription, deliveryIds=[delivery], attempts=[0])
                receipt.set()
                assert confirm.wait(5)
                self.json(dict(received=True))
            else:
                self.json({}, 404)

        def do_DELETE(self):
            mutations.append(self.path)
            self.json(dict(closed=True))

        def do_GET(self):
            if self.path == '/v1/auth/me':
                return self.json(principal)
            assert self.path.startswith('/v1/stream?')
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()

            def send(frame):
                self.wfile.write(('event:frame\ndata:' + json.dumps(frame) + '\n\n').encode('utf-8'))
                self.wfile.flush()

            try:
                send(dict(type='ready', channels=channels))
                send(dict(type='subscribed', subscriptionId=subscription, channels=channels, cursor=cursor, replayComplete=True))
                send(dict(type='replay', cursor=cursor, replayComplete=True))
                waiting.set()
                if mode == 'delivery':
                    assert emit.wait(5)
                    event = dict(eventId=uid(), eventVersion=1, kind='fact', action='issus.delivery.queued', streamId='alias-stream', sequence='1', transactionKey='binary-c02', channel=channels[0], correlationId=uid(), source='worker', audience='client', createdAt='2026-10-21T06:00:00Z', payload=dict(deliveryId=delivery, attempt=0))
                    send(dict(type='event', cursor=uid(), event=event))
                stop.wait(10)
            except (BrokenPipeError, ConnectionResetError):
                pass
            self.close_connection = True

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    process = None
    try:
        directory = root/'apps/cli/.cache'/f'subscribe-binary-{uid()}'
        directory.mkdir(parents=True)
        try:
            env = dict(os.environ, ISSUS_URL=f'http://127.0.0.1:{server.server_port}', ISSUS_TOKEN='binary-test-only-session', ISSUS_CONFIG_DIR=str(directory), ISSUS_PROFILES_FILE=str(directory/'profiles.json'))
            command = ['node', str(root/'apps/cli/dist/index.js'), 'subscribe', '--repo', 'tester/cli', '--issue', '1', '--transport', 'sse', '--once', '--until', '5000' if mode == 'delivery' else '700']
            process = subprocess.Popen(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
            if not waiting.wait(5):
                stdout, stderr = process.communicate(timeout=7)
                raise AssertionError(('no SSE controls', process.returncode, stdout, stderr))
            time.sleep(0.1)
            assert process.poll() is None, 'control frames completed --once'
            if mode == 'delivery':
                emit.set()
                assert receipt.wait(5), 'no HTTP receipt'
                time.sleep(0.1)
                assert process.poll() is None, 'exit before receipt confirmation'
                confirm.set()
            stdout, stderr = process.communicate(timeout=8)
            assert 'binary-test-only-session' not in stdout + stderr
            expected = 0 if mode == 'delivery' else 3
            assert process.returncode == expected, (process.returncode, stdout, stderr)
            frames = [json.loads(line) for line in stdout.splitlines()]
            assert any(frame.get('type') == 'replay' for frame in frames)
            assert f'/v1/subscriptions/{subscription}' in mutations
            assert not any(any(part in path for part in ['comments', 'application', 'process']) for path in mutations)
            if mode == 'deadline':
                assert 'STREAM_WAIT_TIMEOUT' in stderr and not receipt.is_set()
            print(json.dumps(dict(case=mode, exit=process.returncode, controlsDidNotExit=True, receiptConfirmed=receipt.is_set(), jsonLines=len(frames), implicitAckProcessApplication=0)))
        finally:
            # Isolated non-secret cursor/journal evidence stays in the CLI cache for review.
            print(f'cursor evidence: {directory}')
    finally:
        emit.set()
        confirm.set()
        stop.set()
        if process and process.poll() is None:
            process.kill()
            process.communicate()
        server.shutdown()
        server.server_close()
        thread.join()


for case in ['delivery', 'deadline']:
    run_case(case)
print('C-02 binary: pass=2 fail=0')
