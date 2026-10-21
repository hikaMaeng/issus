# 검증

draft-memory.test.ts는 principal/owner/sid/경로 격리·401/만료·명시 복원·원 revision·반복401·버리기·늦은 write를 순수 node:test로 검사한다. index.test.tsx는 SSR markup·기본 hook·명시 복원 경계를 검사한다. jsdom은 사용하지 않는다.

entry/app/session.test.ts는 cookie 복구→동일 세션 명시 연결→7종 작성 내용 변경→실제 인증 중단→재인증 blank→명시 복원을 순수 상태 전이로 검사한다. 다른 alias/sessionId/경로 전환은 보관을 유지한다. 배포 브라우저 P9-R2/R3/R4/R5/R7/R8/R9의 실제 401·412·격리·게시0 단언은 별도 수용 기준이다.

배포 Playwright는 tests/browser/p9-u1.test.mjs의 P9-R1~R6다. role/label만 사용하고 실제 cookie 제거→auth/me401과 브라우저 clock의 실제 expiresAt 타이머를 확인한다. API 성공 응답 mock은 없다. 편집412·COMPACT 재검토·실시간 unmount·storage 비저장도 확인한다. 샌드박스 source/SSR PASS와 호스트 DOM PASS를 구분한다.

P9-R7~R9는 HANDOFF·빠른 ACK·inbox ACK의 실제 auth/me401→동일 principal 재인증→복원 전 기본값→명시 복원을 검사한다. 후속 이슈 재확인·댓글별 격리·복원 시 게시0을 함께 확인한다. delivery/index.test.tsx의 SSR은 한 inbox scope 안에서 repo·issue·comment별 격리와 비활성 복원 상태를 검사한다.

s5: entry/app/routes.test.tsx의 실제 SessionConnection SSR은 loading/anonymous/confirmed 세 상태에서 form 1개와 details 열림 경계를 검사한다. 인증 완료 뒤 접힌 form의 입력 제거·busy=false를 includeHidden role로 읽으며, 익명 입력·제출은 visible role만 쓴다. P9-02 발급 결과 region은 input과 이름이 달라 getByLabel이 유일하다.

P9-14는 두 편집기의 cookie/CSRF를 별도 context에서 실제 연결한다. 같은 context의 새 탭은 CSRF가 없고 재연결 시 다른 탭의 cookie/CSRF 쌍이 바뀔 수 있다. P9-17은 각 댓글 본문을 구별하면서 총39999/40000 codepoint를 유지한다. P9-21의 첫 target은 pull 보류 중 SSE frame/id·영수 transport=sse를 확인한 후 pull을 푼다. 초기 replay의 영수 완료를 확인하고 단절하며, 처리 중 단절의403 경계 결함은 별도 알려진 실패로 보존한다.

P9-20은 cookie만 가진 새 탭의 CSRF_MISSING 연결 오류를 먼저 확인한 뒤 동일 principal의 명시 연결→실제 WS 재개를 검사한다. P9-21은 별도 context/별칭에서 실제 SSE 요청을 AbortController로 종료하고 P7의 새 subscription/cursor 재연결·두 delivery의 SSE frame/id/HTTP receipt를 확인한다. 성공 payload 대체0, WS 연결0, 자동 ACK0. 단계 로그·sse-case.json은 정리 전에 보존한다.

호스트 재실행: npm run deploy 후 ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus 및 ISSUS_TEST_SERVER_URL=http://127.0.0.1:18142로 node apps/issus/tests/browser/p9-host.mjs --standard. 총47건, P8 12건 유지. source/HTTP 증거와 실제 브라우저47/47은 별도로 판정한다. 알려진 실패·잔여 미검증은 tests/plans/p9-last-three-20261022.md 및 tests/reports/p9-ui/20261022_011000.md를 따른다.
