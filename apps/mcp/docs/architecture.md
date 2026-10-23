# 구조

`src/server/entry` → SDK stdio transport → `tools` → `connection`/`wait` → 기존 issus HTTP API.

| 폴더 | 책임 |
| --- | --- |
| config | env·기존 profiles.json 형식, 서버/저장 토큰 결합 검사 |
| connection | `IssusClient`, principal, owner 검사, 멱등 write·operation 관측 |
| wait | snapshot별 `InboxModel`, 큐, hydration, receipt, 단일 wait |
| journal | metadata만 원자 저장·flush·exclusive lock |
| tools | 정본 validator·도구 입력/출력 schema·업무 증거 연결 |
| redaction | known token 치환·domain `mask`·bearer subprotocol 제거 |
| transport | SDK request/cancel 신호와 JSON-RPC 전용 출력 |

`issus_domain/common`과 `issus_domain/front` 공개 경계만 import한다. 다른 앱·서버·runtime 소스 import는 없다.
v1은 pull이므로 공개 `subscribe`·`StreamCheckpoint`의 WS/SSE 경로를 실행하지 않으며 transport cursor를 만들지 않는다. Monitor/runner의 스트림 경로와 cursor를 섞지 않는다.

산출물: `dist/index.js`(Node24 ESM bundle), source map, SHA256 manifest. root Docker/Turbo 설정은 이 앱이 수정하지 않는다.
