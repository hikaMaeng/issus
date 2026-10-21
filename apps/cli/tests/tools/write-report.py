"""Materialize P7 evidence using recorded command output and actual binary comparisons."""
from datetime import datetime, timezone, timedelta
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[4]
CACHE = ROOT / '.cache/p7'
LOGS = CACHE / 'validation'


def git(*args):
    result = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True)
    return result.stdout


def main():
    now = datetime.now(timezone(timedelta(hours=9)))
    name = now.strftime('%Y%m%d_%H%M%S')
    directory = ROOT / 'apps/cli/tests/reports/cli-compatibility'
    directory.mkdir(parents=True, exist_ok=True)
    results = json.loads((CACHE / 'binary-results.json').read_text(encoding='utf-8'))
    cli_log = (LOGS / 'final-cli-test.log').read_text(encoding='utf-8')
    values = {key: int(re.search(r'ℹ ' + key + r' (\d+)', cli_log).group(1)) for key in ['tests', 'pass', 'fail', 'skipped']}
    source = ROOT / 'packages/issus_domain/tests/fixtures/issue-board-v2/manifest.json'
    table = ['# C-01 post 교차표', '', 'actual Python issue_post.py vs built Node dist/index.js. stdout 전체 UTF-8 SHA-256와 exit 비교; stdoutEqual은 전체 문자열 비교다.', '',
             '| 입력 | mode | Python exit | issus exit | stdout 동일 | SHA-256(둘 동일) |', '| --- | --- | ---: | ---: | --- | --- |']
    for row in results['results']:
        table.append(f"| {row['path']} | {row['mode']} | {row['pythonExit']} | {row['cliExit']} | {row['stdoutEqual']} | {row['cliStdoutSha256']} |")
    table += ['', f"cases={results['cases']} pass={results['pass']} fail={results['fail']} preflights={results['preflights']} mutations={results['mutations']}.",
              'good/compact.md는 같은 본문에 design §8 필수 packet sidecar/sample/by 옵션을 보충했다. stderr의 native preflight 진단은 stdout 동등성 비교 대상이 아니다.',
              f"P3 fixture manifest SHA-256: {hashlib.sha256(source.read_bytes()).hexdigest()}", '']
    cross = directory / f'{name}-post-cross-table.md'
    cross.write_text('\n'.join(table), encoding='utf-8', newline='\n')

    paths = ['apps/cli', 'packages/issus_domain/src/front']
    def owned():
        files = git('ls-files', '--modified', '--others', '--exclude-standard', '--', *paths).splitlines()
        return sorted({f for f in files if f not in ['apps/cli/package.json', 'packages/issus_domain/src/front/index.ts']})

    report = directory / f'{name}.md'
    text = f'''# Test Report: P7 CLI·독립 클라이언트

## Timestamp
{now.isoformat(timespec='seconds')}, issus-1-client/s1. g1=6308181113, design v2.1. 상태: 구현 완료·호스트 표준 검증 BLOCKED(ASK 6310190388).

## Environment
Windows PowerShell, Node 26.4.0, TypeScript 7.0.2, bundle target node24. head={git('rev-parse', '--short', 'HEAD').strip()}. 실제 bearer/비밀번호 파일 열람 없음; 시험 인증은 dummy fixture다. DB·Docker·배포 서버·P8 UI는 이번 검증 대상이 아니다.

## Executed Steps
| 명령/경계 | 결과 | 근거 |
| --- | --- | --- |
| npm run build --workspace issus_domain | exit0 | final-domain-build.log |
| npm run lint --workspace issus_domain | exit0 | final-domain-lint.log |
| npm run lint --workspace @issus/cli | exit0 | final-cli-lint.log |
| npm run build --workspace @issus/cli | exit0 | final-cli-build.log |
| npm test --workspace @issus/cli | exit1, spawn EPERM(파일 격리 전) | cli-standard.log |
| npm test --workspace issus_domain | exit1, spawn EPERM(파일 격리 전) | domain-standard.log |
| CLI tsc JS emit + node --test --test-isolation=none | tests={values['tests']} pass={values['pass']} fail={values['fail']} skipped={values['skipped']} | final-cli-emit.log·final-cli-test.log |
| domain front model tsc emit + node --test --test-isolation=none | 7/7 PASS, exit0 | final-model.log |
| node --test --test-isolation=none scripts/cli-manifest.test.mjs | 1/1 PASS, exit0 | manifest.log |
| node_modules/.bin/issus.cmd --help | exit0 | final-shim.log |
| Python binary-contract.py (실제 Python·built Node) | {results['pass']}/{results['cases']} PASS, exit0; preflight={results['preflights']}, mutation={results['mutations']} | final-binary.log·[교차표]({cross.name}) |

모든 log는 `.cache/p7/validation/`, 실제 binary의 stdout hash/exit는 `.cache/p7/binary-results.json`. Python 원 실행37은 `.cache/p7/python-post-results.json`이다.

## Observed Logs
정본32 good/5 bad stdout·exit 동일. watch 11댓글 Python/native golden은 분류 행·푸터가 동일하며 §8의 pending 선행·global pending을 추가했다. 반복 me/mine/board·peek 무쓰기·2페이지 실패시 기존 파일 보존·explicit process만 커서 반영을 확인했다.

실제 HTTP/WS·HTTP/SSE 모의 서버로 bearer header, UTF-8 chunk, Last-Event-ID/WS cursor 재접속, event dedupe, 동일 attempt receipt key 재사용, 새 attempt receipt, once, auth 종료, cursor 만료 새 snapshot, 취소시 업무 ACK/process/application 미생성을 확인했다. 출력 실패와 receipt 실패는 확인 전 cursor를 전진시키지 않았다.

operation 최종422 이유 순서·timeout3·key/operation journal, session 409 재생불가의 명시 재발급 안내, compact metadata/packet sidecar, alias owner-wide 충돌, board 0/1/3, token redaction을 확인했다. Windows 한글/공백/emoji 경로·CRLF·BOM·codepoint·UTF-8 저장도 확인했다.

## Failures
CLI 보조 실행의 두 실패는 `auth set saves restricted UTF-8 profile...`와 `session success saves token...`다. Windows icacls의 사용자전용 DACL 설정이 sandbox에서 Access is denied로 실패하여 exit2였다. 권한을 낮추거나 skip하지 않았다. profile permission 실패 전 secret 내용을 임시 파일에 쓰지 않으며 stdout token fallback도 없다. 호스트에서 해당 성공 경로와 표준 npm test를 재실행해야 완료다.

## Reproducibility
[계획](../../plans/cli-compatibility-20261021.md) 및 [testing](../../../docs/testing.md)의 명령을 따른다. source `src/tests` 6개 파일, shared `front/model/model.test.ts`, Python oracle/실제 binary driver를 사용한다. API는 design §7 계약 모의 응답이며 P4/P5/P6 실서버 왕복·실DB·배포·장시간 구독은 P8 통합 수용에서 미실행이다.

판단: native watch는 미처리 delivery/호환 pending이 남은 nonTTY+증거 없음에3, 순수 canonical 읽기·peek는0. board unavailable은 정본 closed-only3으로 매핑. alias/board의 native registry provenance를 유지하고 GitHub search 단계를 위조하지 않는다. 비댓글 알림은 sourceEventId를 표시하며 SEEN comment id로 바꾸지 않는다.

추가 읽기 장벽에서 CC ASK 6310276428 bootstrap wire 제안을 확인했다. 아직 DECISION 전이므로 승인된 P3의 ready/subscribed/event/replay/error만 수용한다. 승인/P3 갱신 뒤 P7/P8 소비자 후속 시험이 필요하며 미승인 frame을 구현하지 않았다.

## Locator Outcome
P7은 DOM/React를 만들지 않는다. browser locator·deployed headless는 N/A, P8 소유다.

## Ownership
소유 변경 파일 수: OWNED_COUNT. manifest·top-level front barrel은 base ACK 6309976361로 P1이 변경했으며 이 수에서 제외한다. 서버·루트·다른 담당 변경을 편집/커밋/push하지 않았다.
변경 파일 전체: `.cache/p7/owned-files.json`, git status: `.cache/p7/validation/owned-status.log`.

공개 export: `issus_domain/front`의 IssusClient·ClientError·OperationTimeout·subscribe·SocketFactory·StreamCheckpoint·InboxModel·scopeKey·ClientCursors·decodeFrame·SseFrameParser·StreamModel. CLI entry=apps/cli/dist/index.js, manifest는 P1 고정 계약이다.
'''
    report.write_text(text, encoding='utf-8', newline='\n')
    files = owned()
    report.write_text(text.replace('OWNED_COUNT', str(len(files))), encoding='utf-8', newline='\n')
    (CACHE / 'owned-files.json').write_text(json.dumps(files, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    (LOGS / 'owned-status.log').write_text(git('status', '--short', '--untracked-files=all', '--', *paths), encoding='utf-8', newline='\n')
    summary = {'report': str(report.relative_to(ROOT)), 'crossTable': str(cross.relative_to(ROOT)), 'files': len(files), 'cli': values, 'binary': {k: results[k] for k in ['cases', 'pass', 'fail', 'preflights', 'mutations']}}
    (CACHE / 'report-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
