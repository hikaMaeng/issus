# constraints

worker가 domain migration을 자동 보충하지 않는다. agent는 별도로 DB·각 소비 큐의 첫 성공 poll·실행/종료 상태를 검사한다. 장애는 /ready503이며 /health는 프로세스 생존200이다.
