# P4 루트 조립 검증

Created: 2026-10-21 · 담당 issus-1-base/s3 · RE:6309746634

Goal: P4 공개 경계·의존성·broker HTTP/auth/migration/readiness 조립 검증.

Environment: Windows PowerShell, Node/npm 설치본, loopback Postgres+pgmq 15440. npm install·커밋·push 없음.

Preconditions: P4 승인, agent/s3 optional ready hook 제공. P5/P6/P7 작업 경계 유지. DB 시험은 고유 schema를 사용하고 종료 시 해당 schema만 정리.

Steps / Expected:

1. 요청 표 및 이전 requests와 현재 파일 대조. 정확한 pin, runtime dependency와 타입만 재수출.
2. domain/runtime/app 각각 npm run lint 및 npm test. 환경 차단은 로그 원문으로 기록하고 성공으로 세지 않는다.
3. broker build:server. baseline SQL 원본/dist/app SHA-256 일치, app manifest에 자산 포함.
4. 임시 JS emit+node --test 단일 프로세스: agent의 실제 HTTP surface에서 ready false→503/true→200, HTTP auth, 선행 JSON parser 오류→공통 JSON400. P5 queues/reactions placeholder와 WS allowedActions=[] 확인.
5. node로 bundle의 createBroker 실행: 별도 schema에서 migrate/bootstrap/listen, /health200·/ready200, /v1/auth/me 미인증401·fixture bearer200. 해당 schema migration row를 지우면 /ready503, 종료 후 schema 정리. token 원문 출력 없음.

Logs To Capture: .cache/base-s3/*.log, bundle/SQL SHA-256, 실제 HTTP status/body, git diff --check와 변경 파일 목록. 전체 deploy/Docker 검증은 호스트로 이관.

Locator Contract: UI 변경 없음. HTTP 경로와 JSON status/error code로 판정.
