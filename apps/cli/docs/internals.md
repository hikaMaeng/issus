# internals

## runner

`<evidenceRoot>/<alias>/journal.json`에는 identity/scope·delivery/source·단조 phase·spawn intent·ACK/REPORT id를 기록한다. 본문과 결과 전문은 별도 파일이다. `outbox.json`은 write 전 key/path/body/session을 동결하고 operationId·최종 응답을 보존한다. temporary flush→같은 볼륨 rename, Windows 공유 잠금 오류는 제한 횟수만 재시도한다.

STAGED→RECEIPTED→ACK_POSTED는 업무 미종결이다. REPORT_POSTED→APPLICATION_RECORDED→PROCESSED가 완료 경계다. ACK 후 crash는 blocked, spawn intent 전후 crash는 uncertain blocked이며 자동 재spawn하지 않는다. REPORT 이후 crash는 같은 outbox 관측과 apply/process만 재개한다. delivery attempt·sid는 실행 identity에 포함하지 않는다. 라우팅 전 snapshot 의무의 임시 항목은 실제 delivery ID가 오면 ACK 증거를 승계해 병합한다. 같은 부팅에서는 receipt 후 진행하고 재시작 후에는 blocked로 보존한다. API의 ackState도 대조해 route 상태 지연을 신규 작업으로 오해하지 않는다.

새 snapshot마다 InboxModel을 생성하고 cursors/versions만 승계한다. 대기 큐와 job 상태는 별도로 유지하며 refresh가 작업을 종결하지 않는다. 처리 커서는 서버의 연속 prefix만 사용한다. onFrame에서 자식 결과를 await하지 않는다.

기동 시 디스크에서 읽은 미종결 job만 recovery로 표시한다. 같은 부팅의 virtual→delivery 병합은 진행 중 ACK 완료를 현재 comment 인덱스의 job에도 기록하고 ACK/source NOTE outbox key를 승계한다. comment별 ACK 게시를 한 번만 진행하므로 refresh와 실행이 겹쳐도 새 key로 중복 게시하지 않는다. 자기 ACK 증거 없는 서버 ackState는 기존 보수적 blocked 판정을 유지한다.

실행 파일은 startChild 안에서 해석한다. 절대경로/호스트 PATH에 파일이 없거나 디렉터리이면 `EXECUTABLE_NOT_FOUND: <file>`로 failed REPORT와 not-applied를 남긴다. 자식 예약과 실제 PID 생성은 별개이며 실제 spawn 이벤트는 OS가 반환한 PID를 기록한다.

Windows shim은 고정 PowerShell EncodedCommand와 비밀 없는 JSON argv 환경을 사용한다. 본문/모델/cwd를 셸 코드에 삽입하지 않는다. PID·OS creationTime·실행 파일·spawn cwd를 기록하고 트리 종료 전에 재확인한다. 불명확한 PID는 kill하지 않는다.

`entry/arguments`는 비반복 옵션 중복을2로 거부하며 me/mine/board만 누적한다. alias·board·compact는 check/find/prepare를 생략할 수 있다. 원문 파일은 fatal UTF-8 decode와 ignoreBOM으로 읽어 BOM을 validator까지 보존한다.

scope key는 서버+owner+token alias/sid+정렬 repo/issues/boards+me 집합+sinceCompact다. 같은 state 파일에서도 scope가 섞이지 않는다. Python timestamp map은 native cursor로 변환하지 않고 첫 snapshot으로 다시 읽는다.

| 상태 | commit 규칙 |
| --- | --- |
| paginationCursor | 현재 immutable snapshot 페이지 |
| refreshCursor | 모든 페이지+출력 성공 후만 교체 |
| processedCursor | 서버가 반환한 처리 prefix; GET으로 생성하지 않음 |
| transportCursor | event 출력+해당 receipt 성공 뒤 저장, pull cursor와 교환 금지 |

InboxModel은 viewKey로 history/inbox를 병합하고 deliveryId+aliasEventSequence로 같은 attempt의 state 갱신도 upsert한다. 오래된 sequence는 최신 상태를 덮지 않는다. watch `--full`은 접힌 OTHER를 immutable comment 단건으로 복원한다. pending은 API의 호환 window/global 집합이며 ackState로 대체하지 않는다.

subscribe는 eventId dedupe·stream별 sequence를 사용한다. 1001/1013·일시 장애는 기존 subscription을 닫고 generation별 새 key/구독을 만든 뒤 backoff한다. 재실행도 저장된 구독 ID를 재사용하지 않는다. 같은 scope/channel의 마지막 확정 cursor만 승계한다. auth1008·잘못된 frame은 종료한다. cursor 만료·scope 변경은 새 snapshot을 발급하고 ordering 경계를 초기화한다. once는 delivery 영수와 저장 뒤만 종료한다. until은 공통 AbortSignal로 연결·SSE read·영수·backoff를 중단하고 exit3으로 번역한다. once/취소/만료는 subscription만 닫으며 마지막 transport cursor를 보관한다. 출력/파일 실패시 event cursor를 전진시키지 않는다.

상태 변경은 lock+동일 디렉터리 temporary+rename, UTF-8(no BOM)/LF다. profile permission 설정 실패시 비밀을 temporary에 쓰기 전에 종료한다. raw token을 저장하는 유일한 파일은 profiles이며 session token API 응답은 메모리에서만 취급한다.
