# 구조

entry는 cookie 인증·네이티브 링크 분기, pages는 조회·상태, features는 envelope/comment/compact/composer/delivery/closing, resources는 한국어 카피, styles는 표현이다. 교차 패키지는 issus_domain/front 공개 export만 사용한다. React는 apps 경계에 있다.

일반 링크 전환으로 cookie를 유지하고 CSRF proof만 sessionStorage에 보관한다. inbox는 entry/socket의 same-origin native WS를 P7 subscribe에 주입하고 InboxModel·5초 전체 snapshot 조회를 결합한다. P7이 영수·커서·새 구독 재연결을 소유한다. closed checkpoint는 재연결 대기, subscribed는 연결됨, 재시도 소진은 alert다. [서버 구조](../../../../../docs/architecture.md)를 참조한다.
