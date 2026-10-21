# 검증

draft-memory.test.ts는 principal/owner/sid/경로 격리·401/만료·명시 복원·원 revision·반복401·버리기·늦은 write를 순수 node:test로 검사한다. index.test.tsx는 SSR markup·기본 hook·명시 복원 경계를 검사한다. jsdom은 사용하지 않는다.

배포 Playwright는 tests/browser/p9-u1.test.mjs의 P9-R1~R6다. role/label만 사용하고 실제 cookie 제거→auth/me401과 브라우저 clock의 실제 expiresAt 타이머를 확인한다. API 성공 응답 mock은 없다. 편집412·COMPACT 재검토·실시간 unmount·storage 비저장도 확인한다. 샌드박스 source/SSR PASS와 호스트 DOM PASS를 구분한다.

P9-R7~R9는 HANDOFF·빠른 ACK·inbox ACK의 실제 auth/me401→동일 principal 재인증→복원 전 기본값→명시 복원을 검사한다. 후속 이슈 재확인·댓글별 격리·복원 시 게시0을 함께 확인한다. delivery/index.test.tsx의 SSR은 한 inbox scope 안에서 repo·issue·comment별 격리와 비활성 복원 상태를 검사한다.
