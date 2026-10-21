# architecture

Docker는 호스트 dist만 복사한다. 조립 entry와 manifest는 P1, 기능 폴더는 후속 담당 소유다.

P4 http/{repo,issue,comment,validate,alias,session,board,handoff,operations,auth}는 도메인 제출기와 runtime 인증을 호출한다. 원문 문법/문맥/권한을 route에서 복제하지 않는다. JSON64kb →인증/CSRF →경로·허용키 →도메인 submit/read/preflight →안전한 오류 순서다. /health·/ready·문법 전용 /v1/validate만 세션 없이 실행한다.

`createCoreHttpRouter({intake,auth,origin,health?,historyReader?})`를 P1 entry가 연결한다. historyReader는 P5 canonical+inbox builder 주입 지점이다. P4 기본 canonical builder도 snapshot UUID·scope·만료·불변 페이지를 유지한다. onAccepted의 worker 실행은 P4 시험 하네스 전용이고 운영은 실제 intake consumer가 맡는다.

P6 `installCompactRoutes(router,options,service?)`는 P4 coreAuthentication 뒤에 연결하고 coreHttpError를 뒤에 둔다. CompactService는 공통 UoW, COMPACT 댓글은 공통 submit을 사용한다. historyReader에 P6 readCompactHistory 또는 P5 union reader를 주입한다.

production entry는 `createInboxHistoryReader(inbox)`와 `compactPublication`을 주입한다. `createDeliveryHttpRouter`·SSE는 core router 앞에 경로 한정 인증으로 설치해 공개 validate를 보존한다. WS는 P5 socketPolicy·동일 RuntimeAuth와 lifecycle 훅을 쓰며 반응표의 실제 큐 이름은 worker와 같다. bootstrap/migration용 연결은 기동 후 닫고, UoW·stream store·SSE tail은 agent broker의 pool을 공유한다. 종료는 SSE subscription 정리→broker WS/HTTP/tail→pool 순서다.
