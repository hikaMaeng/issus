# 트랜잭션 경계

`run`은 명령 키를 한 번 생성하고 attempt마다 Client를 빌린다. `transact`가 error listener·BEGIN·flush·COMMIT·ROLLBACK·release를 소유한다. Client 반납이 완료된 뒤 재시도 대기한다.
