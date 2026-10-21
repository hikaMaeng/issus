# 공개 export

| export | 계약 |
| --- | --- |
| SessionDraftMemory | begin/suspend/write/initial/hasPending/restore/discard; 메모리 전용 |
| sessionDraftScope | Principal/null + pathname/search → owner·alias·sid·경로 key/null |
| SessionDraftProvider | memory/scope/children; 인증 분기 위에서 유지 |
| useSessionDraft<T> | slot:string, initial:T 또는 초기화 함수 → React useState 호환 tuple; provider 없으면 지역 state |
| DraftRecovery | pending/message/onRestore/onDiscard; 보관 본문은 렌더하지 않음 |

기존 ConnectionForm·SessionBanner·SessionIssueForm·ConfirmDialog·RevokeSession·safeReturnPath 계약은 유지한다.

HANDOFF는 `handoff:<repo>:<number>:{to,ackBy,reply,text,deferred,id,ack}`, 빠른 ACK는 `quick-ack:<issuePath>:<commentId>:body`, inbox ACK는 `inbox-ack:<repo>:<number>:<commentId>:body` 슬롯을 사용한다. 서버 확인·revision·검사 결과·operation/key·dialog 열림은 보관하지 않는다.
