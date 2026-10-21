# architecture

`entry`는 인자/명령 연결만, `commands/*`는 파일 입출력과 HTTP 호출을 담당한다. `client`는 인증 profile·멱등 journal·Node WS 어댑터를 연결한다. 도메인 문법은 `issus_domain/common`, 환경 독립 HTTP/WS/SSE·InboxModel·scopeKey는 `issus_domain/front`다. packages에서 apps로 import하지 않는다.

| 경계 | 역할 |
| --- | --- |
| `profiles` | env/명시 bearer file/사용자전용 profiles, 토큰 출력 금지 |
| `state` | 원자 UTF-8 저장·scope별 커서·request hash→UUID/operationId |
| `output` | codepoint 표시 상한·정본 문구·토큰 redaction |
| `client/socket` | ws Authorization header·bounded 수신 큐·취소 |

`scripts/build-app.mjs`(P1)가 shebang이 있는 self-contained node24 ESM을 번들한다. WS 의존성은 CLI 소유, domain 모델은 fetch와 socket factory를 주입받는다. `apps/issus/src/front`나 서버 경로는 P7이 수정하지 않는다.
