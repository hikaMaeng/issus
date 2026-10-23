# 시험

계획: [bridge-20261023.md](../tests/plans/bridge-20261023.md). 보고: `tests/reports/bridge/`.
최신 실행: [s3 호스트 응답·큐 정체 회귀](../tests/reports/bridge/20261023_185100.md) — lint PASS, tests 40/40. 원본 새 회귀3건 FAIL을 확인한 뒤 시스템 author·null fact·실패 격리·진단 비밀 제거를 검증했다. 수정 소스의 bundle 재빌드·운영 재실기는 호스트 몫이다.

`npm test`의 pretest는 TypeScript로 `.cache/test`에 JS를 emit하고 node --test/test-isolation=none으로 실행한다. tsx/esbuild의 Windows sandbox 자식 프로세스 제약을 피하면서 같은 node:test 계약으로 실행한다. fixture는 loopback 임시 HTTP 포트·자기 임시 디렉터리만 사용한다.

stdio 통합은 실제 SDK StdioServerTransport와 byte stream을 연결해 initialize/tools/list/tools/call/cancel을 시험한다. 대상은 가짜 HTTP 서버다. 가짜 응답을 실DB/운영 서버 증거로 합산하지 않는다.

검증 축: M01~M10, ACK 직후 crash·processed 뒤 미완료 recovery, 새 snapshot 연속 refresh·BigInt 역순 갱신, mention-only pending, HANDOFF 반론/수용, 202 미확정 key, 비밀 canary·서버 profile 결합, lint.

호스트 추가 확인: bundle의 실제 OS stdio spawn/EOF, root build/deploy, Codex/Claude CLI 선검증, 별도 사람 앱 수용. CLI 명령과 기대는 [host-precheck](../examples/host-precheck.md)에 있다. UI가 없어 browser locator는 해당 없음.
