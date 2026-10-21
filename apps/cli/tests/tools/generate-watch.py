"""Regenerate the controlled native watch golden from the read-only Python oracle."""
from pathlib import Path
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'fixtures'
out.mkdir(parents=True, exist_ok=True)
comments = [
    ('1000001', 'FROM:issus-1-orch/s1 TO:issus-1-client TYPE:HOLD ACK-BY:2026-10-21T19:00+09:00\n과거 HOLD, 구간 밖 pending.'),
    ('1000002', 'FROM:issus-1-orch/s1 TO:ALL TYPE:COMPACT SEEN:1000001\n## ===== COMPACT #1 through 1000001 =====\n열린 HOLD:1000001.'),
    ('1000003', 'FROM:issus-1-orch/s1 TO:issus-1-client TYPE:ASK ACK-BY:2026-10-21T19:00+09:00\nASK @issus-1-client: 구현 검토.'),
    ('1000004', 'FROM:issus-1-worker/s1 TO:issus-1-peer TYPE:NOTE CC:issus-1-client\n참고 공유.'),
    ('1000005', 'FROM:issus-1-peer/s1 TO:ALL TYPE:NOTE\n전체 알림 😀.'),
    ('1000006', 'FROM:issus-1-peer/s1 TO:issus-1-worker TYPE:NOTE\n다른 사람 사이 전문.'),
    ('1000007', '작성: issus-1-worker / s1 | worker\nTYPE: STATUS\nTO: issus-1-old\n레거시, 관찰 별칭 수신.'),
    ('1000008', 'FROM:issus-1-client/s1 TO:issus-1-orch TYPE:NOTE RE:1000003\n내 NOTE도 호환 pending을 해소한다.'),
    ('1000009', 'FROM:issus-1-orch/s1 TO:issus-1-client TYPE:DECISION ACK-BY:2026-10-21T19:00+09:00\n미해소 결정.'),
    ('1000010', 'FROM:issus-1-peer/s1 TO:issus-1-worker TYPE:DECISION ACK-BY:2026-10-21T19:00+09:00\n다른 수신자 DECISION도 ALL로 표시.'),
]


def comment(pair):
    id, body = pair
    time = f'2026-10-21T06:00:{int(id) - 1000000:02}Z'
    return {'id': int(id), 'body': body, 'created_at': time, 'updated_at': time}


fixture = {'repo': 'hikaMaeng/issus', 'issues': {
    '1': {'number': 1, 'state': 'open', 'title': '주 이슈', 'body': 'STATE:running OWNER:issus-1-orch UPDATED:2026-10-21T15:00+09:00 BOARD:#2\n과제', 'comments': [comment(c) for c in comments]},
    '2': {'number': 2, 'state': 'open', 'title': '[공통 게시판]', 'body': 'STATE:running OWNER:issus-board UPDATED:2026-10-21T15:00+09:00\n게시판', 'comments': [comment(('1000011', 'FROM:issus-1-peer/s1 TO:ALL TYPE:NOTE\n게시판 NOTE.'))]}
}}
(out / 'watch.json').write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
result = subprocess.run([sys.executable, str(ROOT / 'tools/python-reference.py'), 'watch'], capture_output=True, text=True, encoding='utf-8', check=True, env={**os.environ, 'PYTHONUTF8': '1'})
python = result.stdout
(out / 'watch-python.txt').write_text(python, encoding='utf-8', newline='\n')
# v2 §8 intentionally moves pending before ME and adds global pending outside compact.
at = python.index('PENDING-ACK (')
footer = python.index('--- unread:', at)
native = python[at:footer]
native += 'PENDING-ACK-GLOBAL (COMPACT 구간 밖 미해소 지시):\n'
native += '  hikaMaeng/issus#1 1000001 HOLD FROM:issus-1-orch/s1 ACK-BY:2026-10-21T19:00+09:00 | ' + comments[0][1].splitlines()[0] + '\n'
native += python[:at] + python[footer:]
(out / 'watch-native.txt').write_text(native, encoding='utf-8', newline='\n')
print('watch goldens: python + native (PENDING priority/global additions), fixtures=11')
