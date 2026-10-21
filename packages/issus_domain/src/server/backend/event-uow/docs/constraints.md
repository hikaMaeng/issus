# 고정 제한

쓰기 attempt마다 transaction_timeout·statement_timeout·lock_timeout은 각각 5s다. SQLSTATE 40001·40P01·25P04만 최대 3회 추가 재시도(100·300·1000ms)한다. 23505는 기존 409 CONFLICT다. read는 자동 재시도하지 않는다. 소진된 25P04는 원 SQLSTATE로 worker에 전달되어 lease 해제·원 큐 보존 경로를 탄다.
