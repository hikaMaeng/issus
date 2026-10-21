# 구조

entry는 cookie 인증·네이티브 링크 분기, pages는 조회·상태, features는 envelope/comment/compact/composer/delivery/closing, resources는 한국어 카피, styles는 표현이다. 교차 패키지는 issus_domain/front 공개 export만 사용한다. React는 apps 경계에 있다.

U1의 app-shell/session/issue-filters/roster/feedback는 각 index를 통해 소비한다. AppShell은 main/nav 1개와 페이지 h1을 조립하며 1199px 이하 context를 중앙 details로, 899px 이하 탐색을 native dialog로 이동한다. 동일 nav/aside를 복제하지 않는다. styles/index.css의 --ui-*만 사용하며 root 기본은 dark다.

entry/client BrowserClient는 IssusClient 하위 타입이다. 원 422 code/path/message와 비동기 operation 최종 오류를 보존하며 errorLines의 기존 message 배열은 유지한다. 공통 resources/index는 기존 ko/deliveryLabels와 U1 sessionKo/rosterKo/feedbackKo만 취합한다. U2/U3 resources 파일은 각 소유자가 직접 export/import한다.

일반 링크 전환으로 cookie를 유지하고 CSRF proof만 sessionStorage에 보관한다. inbox는 entry/socket의 same-origin native WS를 P7 subscribe에 주입하고 InboxModel·5초 전체 snapshot 조회를 결합한다. P7이 영수·커서·새 구독 재연결을 소유한다. closed checkpoint는 재연결 대기, subscribed는 연결됨, 재시도 소진은 alert다. [서버 구조](../../../../../docs/architecture.md)를 참조한다.
