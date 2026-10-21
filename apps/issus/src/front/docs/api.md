# API

entry/client의 createBrowserClient/connectBrowser/errorLines/readHistory/readInbox는 UI 경계다. P7 IssusClient가 쓰기 key 재시도·202 poll, InboxModel이 viewKey/E/attempt 병합을 담당한다. readHistory는 단건 comment API로 createdAt/validity/전문을 보강하고 접힌 이슈 화면에서는 latest COMPACT 이전 댓글을 제외한다. 서버 union의 과거 미처리delivery·inbox/의무 상태는 변경하지 않으며 전체 토글에서 원문을 복원한다.

entry/socket의 browserSocket은 P7 SocketFactory를 구현한다. same-origin `/ws`에서 cookie는 `issus.v1`, 메모리 bearer가 주어진 경우 `issus.v1`+`issus.bearer.<token>`을 제안한다. 응답 protocol은 issus.v1이며 token을 URL/DOM/storage에 넣지 않는다. AbortSignal·close/error·256프레임/1MiB 큐 상한을 지원하며 재연결·receipt·cursor를 재정의하지 않는다.

브라우저는 auth/me·browser-session·repos/issues/comments·preflight·inbox·subscriptions·WS·receipts·inbox/process·close를 호출한다. [HTTP 계약](../../../../../docs/api.md)을 따른다.

U1 추가 호출은 [앱 HTTP 계약](../../../docs/api.md)의 sessions 발급/철회, bootstrap repo 개설, aliases check/등록/개명, Q1 목록/상세, Q2 조회다. Q1/Q2 연결 근거는 core REPORT6314466185다. owner/alias/q/sort/order만 서버에 보내고 workState는 보내지 않는다. updated는 서버의 microsecond 순서를 보존한다. 번호 검색은 Q2의 정확 번호이며 제목은 literal 부분문자열이다.

| 공통 export | 입력 → 출력 |
| --- | --- |
| createBrowserClient | token?:string → BrowserClient extends IssusClient |
| connectBrowser | token:string → Promise<void>; CSRF만 저장 |
| hasBrowserCsrf / clearBrowserSession | () → boolean / void |
| errorLines / errorReasons / reasonField | unknown → string[] / unknown → readonly ValidationReason[] / ValidationReason → string 또는 undefined |
| ValidationReason | code/path/message:string; 서버 원문·순서 유지 |
| Principal | alias/sid/kind/owner/ownerId/sessionId/expiresAt optional string |

allPages/readInbox/readHistory·기존 P8 타입은 호환 유지한다. IssueSummary는 ownerAlias/compact/updatedAt 등 서버 필드를 optional로 추가했다. 관리 bearer가 실패해도 cookie principal을 임의 해제하지 않고, cookie 요청401은 App에 전달해 인증·실시간 화면을 중지한다.

| U3 공개 index | 입력 → 출력 |
| --- | --- |
| pages/inbox Inbox | {client:IssusClient,principal:Principal} → ReactElement |
| pages/compact Compact | {client:IssusClient,repo:string,number:number} → ReactElement |
| entry/socket browserStreamClient | (client,transport:ws 또는 sse) → IssusClient 호환 proxy |
| features/delivery DeliveryWrite | 미확정 원 path/body/key 보존, 최종4xx·성공 뒤만 새 시도 |
| features/compact-assistant compactRequest | raw body·packet·sampledIds·compactedBy → 허용 top-level4키 |

Delivery는 receipts·inbox/process·deliveries/:id/application·comments/preflight만 호출한다. COMPACT는 compact/status·prepare·packet?format=json·단건 comments/:id·preflight·comments를 쓴다. 다운로드는 현재 마스킹 markdown의 UTF-8 LF Blob이며 새 prepare나 packetToken 직렬화를 하지 않는다. COMPACT 성공은 본문 COMPACT 포인터와 revision을 다시 읽어 확인한다.
