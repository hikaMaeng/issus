# api

## runner

`runnerCommand(ctx): Promise<number>`는 config·session principal을 검증하고 `HostRunner.run()`에 연결한다. `RunnerDependencies`의 client/socket/clock 간격/자식·Git adapter는 시험 주입 경계다. 프로덕션은 native 파이프와 기존 Node WS adapter를 사용한다.

| 순서 | 기존 API |
| --- | --- |
| 인증·장벽 | GET /v1/auth/me, /v1/inbox, issue detail, immutable comments |
| 수신 | POST /v1/subscriptions, WS /ws, /v1/deliveries/receipts |
| ACK·REPORT | POST issue/preflight 후 issue/comments, 동일 durable UUID |
| 이관 수용 | POST source/handoffs/:commentId/accept, target ACK id |
| 업무 반영·영수 | POST delivery/application, /v1/inbox/process |

HANDOFF ACK·REPORT는 같은 repo의 REPLY-IN target, source NOTE RE는 호환 pending 연결이다. complete는 원 OWNER 소유다. 다른 repo target은 blocked로 보존한다. HTTP 202/응답 유실은 같은 outbox key를 유지한다.

전송은 `/v1`, JSON UTF-8, bearer header다. repo path component는 encode한다. 쓰기는 body와 별개 `Idempotency-Key` UUID를 먼저 journal에 저장한다. 연결 재시도는 같은 key이고 202는 operation을 poll한다. operation id도 journal에 보관한다.

| 명령 | API |
| --- | --- |
| post / post --edit-body | `POST I/comments` / `PATCH I/body`(+최신 GET revision·If-Match) |
| post --dry-run | local P3 문법 → `POST I/preflight {mode,request}`; operation/key 생성 없음 |
| watch / --show | `GET /v1/inbox` / `GET R/comments/:id` |
| watch --processed-file | `POST /v1/inbox/process` (명시 증거만) |
| subscribe | 연결마다 새 `POST /v1/subscriptions` → WS `/ws` 또는 SSE `/v1/stream` → receipts API → 현재 구독 DELETE |
| compact prepare/status | `GET I/compact/packet?format=json` / `GET I/compact/status` |
| alias check/register/rename | owner aliases/check / aliases / aliases/:id/rename |
| board find/ensure | `GET R/board` / `POST R/board/ensure` |
| session open/revoke | `/v1/sessions` / `DELETE /v1/sessions/:id` |
| issue / handoff / admin | §7.2 issue·handoff·repo API 그대로 |

`R=/v1/repos/:owner/:repo`, `I=R/issues/:number`. COMPACT metadata는 `compactPacketToken,sampledIds,compactedBy`; 생략 사유는 `compactDeferredReason`이며 봉투 키로 넣지 않는다.

exit 0=성공, 1=규약/도메인 거부, 2=사용법/파일/연결/인증/서버 오류, 3=미처리/timeout. board none=1·closed=3, compact empty204=1, peek pending 표시는0이다. 202의 `posted:null`을 성공으로 출력하지 않는다. 서버 reasons는 순서대로 표시한다.

stdout: post 정본 OK/REJECTED·watch 텍스트·compact packet/envelope·alias OK/CONFLICT·board BOARD/NONE. post preflight의 checkedAt·compact due는 stderr에 추가하여 정본 stdout 비교를 보존한다. `--json`은 구조화 결과이고 subscribe는 항상 JSON Lines다.

subscribe `--once`는 첫 delivery 영수 성공 뒤0이며 제어·상태 프레임만으로 완료하지 않는다. `--until <ms>` 만료는3과 stderr `STREAM_WAIT_TIMEOUT`이다. 영수 실패/만료시 해당 delivery cursor를 저장하지 않는다. 재접속의 새 구독에는 같은 scope의 마지막 확정 cursor만 전달한다.
