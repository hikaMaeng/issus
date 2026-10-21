# api

| 공개 export | 입력·결과 |
| --- | --- |
| pages/issue Issue | {client,repo,number} → ReactElement |
| pages/issue-create IssueCreate | {client,repo,number?} → ReactElement |
| pages/issue-edit IssueEdit | {client,repo,number} → ReactElement |
| pages/board Board | {client,repo,number?} → ReactElement |
| Composer | 기존 {client,path,onPosted}; optional principal/revision/board/compactHref/draft:{body,key} |
| Comment | 기존 {comment}; optional client/repo/path/principal/seen/onDraft/onPosted/priority/board/readonly |
| Envelope | 기존 {fields}; optional client/repo |
| ReferenceLink | {client,repo,id,supersedes?}; optional onFollow는 현재 article 이동 시 상위 dialog 닫기에 사용 |
| Closing | 기존 {client,path,revision,onClosed}; optional repo/isOpen/replyIn/diagnostics |

Composer index는 TYPES/STATES/requiredFields/parseDraft/serializeDraft/draftSize/quickDraft/protocolTime/TimeAssist/WriteAttempt/useWriteOperation/OperationState를 공개한다. 서버 validator가 최종 판정한다.

HTTP: GET I·I/comments·R/comments/:id·auth/me·inbox·R/board·R·owners/:owner/aliases, POST validate·I/preflight·I/comments·R/issues·R/board/ensure·handoffs/:id/{accept,complete}·I/{close,reopen}, PATCH I/body. 상세 shape는 apps/issus/docs/api.md 정본이다. preflight는 {mode,request}, create 검사는 {mode,body}다. unknown metadata wrapper를 만들지 않는다. Q1의 active 등록 별칭을 TO/신규 OWNER 후보로 읽으며 조회 실패 시 직접 입력과 서버 최종 검사를 유지한다.
