# API

entry/client의 createBrowserClient/connectBrowser/errorLines/readHistory/readInbox는 UI 경계다. P7 IssusClient가 쓰기 key 재시도·202 poll, InboxModel이 viewKey/E/attempt 병합을 담당한다. readHistory는 단건 comment API로 createdAt/validity/전문을 보강하고 접힌 이슈 화면에서는 latest COMPACT 이전 댓글을 제외한다. 서버 union의 과거 미처리delivery·inbox/의무 상태는 변경하지 않으며 전체 토글에서 원문을 복원한다.

entry/socket의 browserSocket은 P7 SocketFactory를 구현한다. same-origin `/ws`에 `issus.v1`만 협상하고 HttpOnly cookie로 인증한다. AbortSignal·close/error·256프레임/1MiB 큐 상한을 지원하며 재연결·receipt·cursor를 재정의하지 않는다.

브라우저는 auth/me·browser-session·repos/issues/comments·preflight·inbox·subscriptions·WS·receipts·inbox/process·close를 호출한다. [HTTP 계약](../../../../../docs/api.md)을 따른다.
