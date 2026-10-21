# 메모리 수명

SessionDraftMemory의 working/pending Map은 App 인스턴스에만 있다. suspend는 현재 working을 pending에 보관하고 working을 제거하므로 unmounted 폼의 늦은 write는 무시된다. pending은 restore/discard 전까지 우선 보존한다. begin은 pending을 노출하지 않는다.

useSessionDraft는 초기값과 상태 변경을 명시 슬롯으로 등록한다. 폼별 lease가 begin/restore 때 바뀌므로 이전 인증 세대의 늦은 setter도 새 working을 덮지 못한다. 원래 편집 기준과 원문을 한 번에 복원하기 위해 entry가 페이지 key를 증가시킨다. authGeneration은 인증 중단 전에 시작한 auth/me 응답이 이후 principal을 되살리는 경합을 차단한다.

entry/app/session.ts의 activateSessionDraft는 cookie 복구와 사용자의 연결 완료에 동일하게 적용된다. 동일 sessionId·scope의 재확인은 suspend/begin을 실행하지 않는다. 빈 기본값을 먼저 pending에 넣으면 실제 401의 편집본이 기존 pending 보호 규칙에 막히므로, force 재마운트로 인증 성공을 처리하지 않는다.

명시적 cookie/CSRF 교환 완료는 BrowserClient 인스턴스를 갱신한다. 쿠키만 복구한 새 탭에서 CSRF_MISSING으로 종료된 Inbox/Issue 구독도 client 의존 효과로 재시작한다. 페이지 key·draft lease·동일 세션 폼은 유지하며 30초 auth/me 재확인은 client를 갱신하지 않는다.
