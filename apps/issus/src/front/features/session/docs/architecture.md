# 경계

entry/app가 SessionDraftMemory와 SessionDraftProvider를 인증 분기 위에 둔다. 401·expiresAt·principal 전환 때 이전 scope를 suspend하고 페이지/스트림을 unmount한다. 재인증은 새 working 슬롯으로 시작하며 pending은 읽지 않는다. 복원 버튼만 pending을 working으로 옮기고 관련 폼 전체를 remount한다.

다른 별칭·sid·경로는 다른 scope다. sessionId/token 회전은 동일 FROM의 메모리 초안을 복원할 수 있다. 기존 미복원 초안은 두 번째 인증 오류의 빈 폼으로 덮어쓰지 않는다. 현재 입력을 먼저 보관하려면 보관 초안을 복원하거나 버리는 명시 선택이 필요하다.
