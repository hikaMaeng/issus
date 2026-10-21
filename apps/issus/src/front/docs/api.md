# API

entry/client의 createBrowserClient/connectBrowser/errorLines/readHistory/readInbox는 UI 경계다. P7 IssusClient가 쓰기 key 재시도·202 poll, InboxModel이 viewKey/E/attempt 병합을 담당한다. readHistory는 단건 comment API로 createdAt/validity/전문을 보강한다.

브라우저는 auth/me·browser-session·repos/issues/comments·preflight·inbox·subscriptions/stream·receipts·inbox/process·close를 호출한다. [HTTP 계약](../../../../../docs/api.md)을 따른다.
