# 공개 export

| export | 계약 |
| --- | --- |
| SessionDraftMemory | begin/suspend/write/initial/hasPending/restore/discard; 메모리 전용 |
| sessionDraftScope | Principal/null + pathname/search → owner·alias·sid·경로 key/null |
| SessionDraftProvider | memory/scope/children; 인증 분기 위에서 유지 |
| useSessionDraft<T> | slot:string, initial:T 또는 초기화 함수 → React useState 호환 tuple; provider 없으면 지역 state |
| DraftRecovery | pending/message/onRestore/onDiscard; 보관 본문은 렌더하지 않음 |

기존 ConnectionForm·SessionBanner·SessionIssueForm·ConfirmDialog·RevokeSession·safeReturnPath 계약은 유지한다.
