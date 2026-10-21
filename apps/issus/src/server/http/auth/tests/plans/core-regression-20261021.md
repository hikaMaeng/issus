# core/s6 회귀 수용 계획

## Created
2026-10-21 · ASK6316534050, DUE23:54+09:00.

## Goal
별칭 POST201/개명200이 worker 대기에 좌우되지 않음, 격리 dist 인스턴스의 auth503 원인 확인, 기존 §7 비동기 계약 보존.

## Environment
Windows Node26, 배포 target node24, 실DB127.0.0.1:15440/issus(PostgreSQL18/pgmq), 랜덤 전용 schema/queue. front는 다른 담당 소유.

## Preconditions
domain/runtime dist 최신, 기존 front dist 보존, broker 서버 esbuild 갱신. 호스트18141–18143 독점 창 확인. 비밀 파일 사용0·token은 임시 메모리만.

## Steps
1. e5b766d..44cd987의 지정 diff와 기존 실패 로그 대조, 변경 전 실DB acceptance 재현.
2. intake worker pause 및 Prefer 없는 HTTP로 별칭 등록201·동일 key 재생·변경 key payload409·개명200·intake queue0 확인.
3. auth.verify 예상 밖 오류의 비밀 제외 서버 로그 확인, 정상401/의존실패503 분리. 미재현은 원인확정으로 쓰지 않는다.
4. dist extra/0004 migration을 포함한 disposable 인스턴스에서 `deployed-browser-host.mjs --fixture-only`: 첫 인증200·전체 fixture provision·schema/queue 잔류0.
5. acceptance 단독83검사/limitations[] 및 integration54/54, 각 workspace lint/npm test. 샌드박스 spawn EPERM이면 표준 실패와 현재 source JS emit 실DB 결과를 구분한다.
6. 실DB RR snapshot을 읽은 뒤 별도connection이 같은행을갱신하도록4회 gate: 원본40001소진·효과0, broker후보5번째완료·효과1. 지속충돌은≤12회/8초새묶음예산으로중단·효과0, 42P01은추가재시도0. 최종dist fixture연속5회·0004/인덱스4·처음/마지막auth200·전체provision·정리잔류0.

## Expected Results
완료201/200은 영속 결과이며202로 위장하지 않는다. 원인·실행 명령·실제 수치/제약·소유 변경 파일을 REPORT에 기록, 커밋/push0.

## Logs To Capture
`.cache/core-s6/*.log`, 호스트 `.cache/core-s6/orch-validation`, fixture 결과(artifact hash/cleanup), 원래 `.cache/final3/orch-validation` 실패 로그.

## Locator Contract
이번 담당은 HTTP/DB/fixture까지. 브라우저 본체·DOM/Playwright는 호스트 담당이며 이 결과에 합산하지 않는다.
