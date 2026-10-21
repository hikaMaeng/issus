# 메모리 수명

SessionDraftMemory의 working/pending Map은 App 인스턴스에만 있다. suspend는 현재 working을 pending에 보관하고 working을 제거하므로 unmounted 폼의 늦은 write는 무시된다. pending은 restore/discard 전까지 우선 보존한다. begin은 pending을 노출하지 않는다.

useSessionDraft는 초기값과 상태 변경을 명시 슬롯으로 등록한다. 폼별 lease가 begin/restore 때 바뀌므로 이전 인증 세대의 늦은 setter도 새 working을 덮지 못한다. 원래 편집 기준과 원문을 한 번에 복원하기 위해 entry가 페이지 key를 증가시킨다. authGeneration은 인증 중단 전에 시작한 auth/me 응답이 이후 principal을 되살리는 경합을 차단한다.
