# constraints

ACK 대기는 없다. timer 작업은 중첩하지 않는다. 실행 실패는 다음 성공 전까지 ready를 거부한다. 원래 5초 transaction/statement/lock 제한을 완화하지 않는다.
