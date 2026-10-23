# architecture

## runner

`commands/runner` 안에서 options·state·delivery·prompt·report·process·adapters를 분리한다. 공개 진입은 `runnerCommand(CommandContext)`, 주입 가능한 실행기는 `HostRunner`다. domain 공개 `IssusClient`·`InboxModel`·`subscribe`·`scopeKey`를 재사용한다.

WS callback은 원자 STAGED 기록만 수행하고 receipt/checkpoint 이후 직렬 큐에 넣는다. 실행 큐와 HOLD 제어 큐가 분리되어 자식 대기 중에도 제어 수신이 계속된다. profile 디렉터리의 identity별 전역 alias lock과 cwd/.cache/runner의 cwd lock을 둘 다 획득한다. evidenceRoot를 바꿔도 같은 principal은 중복 실행할 수 없다. 서버·domain·runtime·MCP 앱에는 runner 코드를 넣지 않는다.

`entry`는 인자/명령 연결만, `commands/*`는 파일 입출력과 HTTP 호출을 담당한다. `client`는 인증 profile·멱등 journal·Node WS 어댑터를 연결한다. 도메인 문법은 `issus_domain/common`, 환경 독립 HTTP/WS/SSE·InboxModel·scopeKey는 `issus_domain/front`다. packages에서 apps로 import하지 않는다.

| 경계 | 역할 |
| --- | --- |
| `profiles` | env/명시 bearer file/사용자전용 profiles, 토큰 출력 금지 |
| `state` | 원자 UTF-8 저장·scope별 커서·request hash→UUID/operationId |
| `output` | codepoint 표시 상한·정본 문구·토큰 redaction |
| `client/socket` | ws Authorization header·bounded 수신 큐·취소 |

`scripts/build-app.mjs`(P1)가 shebang이 있는 self-contained node24 ESM을 번들한다. WS 의존성은 CLI 소유, domain 모델은 fetch와 socket factory를 주입받는다. `apps/issus/src/front`나 서버 경로는 P7이 수정하지 않는다.
