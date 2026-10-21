# 오류 소유

pg-pool은 checkout 때 자체 idle listener를 제거하므로 connect hook이 별도의 Client listener를 유지한다. idle 오류의 연결 제거는 pg-pool이 수행한다. 활성 Client의 오류 원인 포착·폐기·재시도는 EventUnitOfWork의 listener와 finally가 수행한다. 단독 borrower는 query 실패를 처리하고 연결을 반납해야 한다.
