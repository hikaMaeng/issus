# 회귀 시험

`index.test.ts`는 비동기 FATAL·rollback 실패·4회 상한·read-only·40001/40P01·23505·키 유지·listener 회수를 검사한다.

실DB 시험 `apps/issus/src/server/http/auth/transaction-timeout.test.ts`는 PG18에서 SQL 없는 5.25초 대기로 실제 25P04 4회를 발생시킨다. 원 큐 보존·lease 해제·다음 전달 결과1·projection1·반응 큐1과 프로세스 생존을 확인한다. 임계 완화는 없다. 샌드박스 emit 증거는 `.cache/core-s4/`이며 배포된 worker entry 검증은 별도 호스트 책임이다.
