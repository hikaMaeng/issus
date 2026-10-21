"""Pinned compact_prepare.py packet output; no network, credentials or posts."""
import contextlib
import hashlib
import importlib.util
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
import sys

# Reading the canonical scripts must not create __pycache__ in the skill directory.
sys.dont_write_bytecode = True
SOURCE = Path(r'C:\Users\hika0\.claude\skills\issue-board-collab\scripts\compact_prepare.py')
HASH = '617e8c64305792cb36e08d3ef7502c282cd688b191f951971367a57d1fd246f6'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == HASH
sys.path.insert(0, str(SOURCE.parent))
spec = importlib.util.spec_from_file_location('compact_reference', SOURCE)
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)
from issue_watch import header

class FixedTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 10, 21, 4, 0, tzinfo=timezone.utc)

    def astimezone(self, tz=None):
        return self

ref.datetime = FixedTime
temp_root = Path(__file__).resolve().parents[4] / '.cache' / 'compact'
temp_root.mkdir(parents=True, exist_ok=True)
body = 'STATE:running OWNER:tt-1-alpha UPDATED:2026-10-21T04:00+00:00\nGOAL: 패킷 정본 대조'
previous = {'id': 1000001, 'created_at': '2026-10-21T03:00:00.000Z', 'body': 'FROM:tt-1-alpha/s1 TO:ALL TYPE:COMPACT SEEN:1000000\n## ===== COMPACT #1 through 1000000 =====\n누적 요약\ncompacted-by:tt-1-bravo'}
tail = [{'id': 1000002, 'created_at': '2026-10-21T04:00:00.000Z', 'body': 'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\n한글 😀 원문.'}, {'id': 1000003, 'created_at': '2026-10-21T04:00:01.000Z', 'body': '[NOENV] legacy 관찰'}]
cases = []

def rot13(value):
    return value.translate(str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 'NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm'))

def packet_case(issue_body, prev, rows, encoded=False):
    comments = ([prev] if prev else []) + rows
    ref.gh_json = lambda _: [{'body': issue_body}]
    ref.fetch_comments = lambda *args, **kwargs: (comments, prev['id'] if prev else None, [(c, header(c['body'])) for c in comments])
    out = temp_root / f'python-reference-{len(cases)}.md'
    sys.argv = ['compact_prepare.py', '--repo', 'tester/compact', '--issue', '1', '--out', str(out)]
    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        ref.main()
    count = int(re.search(r' masked=(\d+)', stdout.getvalue())[1])
    case = {'body': issue_body, 'previous': prev, 'tail': rows, 'markdown': out.read_text(encoding='utf-8'), 'maskedCount': count}
    if encoded:
        case['bodyRot13'] = rot13(case.pop('body'))
        case['markdownRot13'] = rot13(case.pop('markdown'))
        case['tail'] = [{**{k:v for k,v in row.items() if k != 'body'}, 'bodyRot13':rot13(row['body'])} for row in rows]
        if prev:
            case['previous'] = {**{k:v for k,v in prev.items() if k != 'body'}, 'bodyRot13':rot13(prev['body'])}
    cases.append(case)

for prev in [None, previous]:
    packet_case(body, prev, tail)

# Keep all synthetic secret-like inputs and expected negative cases ROT13, like P3's pinned source fixture.
differential = json.loads((Path(__file__).resolve().parents[1] / 'fixtures/issue-board-v2/differential.json').read_text(encoding='utf-8'))
for i, sample in enumerate(differential['masks']):
    content = rot13(sample['inputRot13'])
    prev = {**previous, 'body':previous['body']+'\n'+content} if i % 2 else None
    rows = [{**tail[0], 'body':'FROM:tt-1-alpha/s1 TO:ALL TYPE:NOTE\n'+content}]
    packet_case(body+'\n'+content, prev, rows, encoded=True)

post_source = SOURCE.with_name('issue_post.py')
post_hash = '67d01e961496f842f5764161c382a9c0abb291d6e62e99811e1e72e9c95b55fd'
assert hashlib.sha256(post_source.read_bytes()).hexdigest() == post_hash
post_spec = importlib.util.spec_from_file_location('post_reference', post_source)
post_ref = importlib.util.module_from_spec(post_spec)
post_spec.loader.exec_module(post_ref)
valid = 'FROM:tt-1-alpha/s1 TO:ALL TYPE:COMPACT SEEN:1000003\n## ===== COMPACT #1 through 1000003 =====\n구간 요약.\ncompacted-by:tt-1-bravo'
rejections = [{'body':v, 'reasons':post_ref.check_comment(v)} for v in [valid.replace('TO:ALL', 'TO:tt-1-bravo'), valid.replace('## =====', '## ===='), valid.replace('through 1000003', 'through 999999'), valid+'x'*(2001-len(valid)), valid+'x'*(2000-len(valid))]]
target = Path(__file__).resolve().parents[1] / 'fixtures' / 'compact' / 'packet-parity.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({'sourceHash': HASH, 'postSourceHash':post_hash, 'generatedAt': '2026-10-21T04:00:00Z', 'cases': cases, 'validation':rejections}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
print(f'packet parity fixtures={len(cases)} validation={len(rejections)} source-sha256={HASH} post-sha256={post_hash}')
