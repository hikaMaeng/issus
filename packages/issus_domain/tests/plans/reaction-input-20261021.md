# Test Plan: reaction-input

## Created
2026-10-21 · issus-1-domain/s2 · ASK 6309173822 / VERIFY 6309173060 P1.

## Goal
design §4.1·§4.3의 원 fact와 worker 소비 command를 구분하고 P2 실제 변환의 출력이 공통 decoder에 연결되는지 검증한다. brief 요구 2·6, §14의 wire/반응 경계에 해당한다.

## Environment
Windows, npm workspace `issus_domain`; `agent/broker` workspace 공개 import만 사용한다. DB·브라우저는 이 순수 wire 경계 시험에 필요 없다.

## Preconditions
P2 `createReactionWork`, `toEventDraft` 공개 export와 설치된 workspace 의존성. `packages/agent`·`server/**` 수정 금지. worker-consumer는 draft를 append해 sequence를 부여한 뒤 실행하므로 시험은 sequence만 명시적으로 부여한다.

## Steps
1. R-01: 28개 fact/failure payload 각각 원 envelope → 실제 `createReactionWork` → 실제 `toEventDraft` → sequence 부여 → `parseReactionInput`을 통과시킨다.
2. R-02: 같은 fact/queue 반복 및 다른 queue를 사용한다. queued fact의 payload source와 반응 top-level source를 별도로 대조한다.
3. R-03: source 각 필드 누락/잘못된 형식, 외부 command, 잘못된 kind/action/payload/envelope를 decoder에 넣는다.
4. 기존 전체 domain 시험, `npm run lint -w issus_domain`, 시험을 포함한 tsc를 실행한다.

## Expected Results
- R-01: 원본은 `parseDomainFact`만 수용, 소비 command는 `parseReactionInput`만 수용. payload·원 source3개 보존, `9007199254740993` 문자열 무손실, 반응 eventId/sequence와 구분.
- R-02: 동일 queue identity 동일/다른 queue identity 상이, nested delivery 원 댓글 source 불변.
- R-03: 모든 잘못된 입력 undefined. 원본 kind는 action별 fact/failure와 일치해야 한다.
- 기존 318건 회귀 + R-01 28건/R-02 1건/R-03 1건 = 348건 통과, lint·시험 타입 검사 exit0.

## Logs To Capture
`.cache/p3-s2/logs/{npm-test,npm-lint,test-types,agent-emit,source-tests}.{log,json}`. 표준 npm test spawn EPERM이면 결과를 BLOCKED로 보존하고 Node 단일 프로세스 실행을 별도 기록한다. P2는 현재 소스를 tsc로 `.cache/p3-s2/agent-emit`에만 임시 emit한다. source hook은 workspace `agent/broker`를 그 산출물로 읽고 domain 소스는 native strip으로 읽는다. 함수 대체·mock과 agent 폴더 쓰기는 없다.

## Locator Contract
N/A: UI 변경 없음.
