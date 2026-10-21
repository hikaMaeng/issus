# 구조

entry는 cookie 인증·네이티브 링크 분기, pages는 조회·상태, features는 envelope/comment/compact/composer/delivery/closing, resources는 한국어 카피, styles는 표현이다. 교차 패키지는 issus_domain/front 공개 export만 사용한다. React는 apps 경계에 있다.

일반 링크 전환으로 cookie를 유지하고 CSRF proof만 sessionStorage에 보관한다. inbox는 P7 subscribe(SSE)·InboxModel과5초 전체 snapshot 조회를 결합한다. [서버 구조](../../../../../docs/architecture.md)를 참조한다.
