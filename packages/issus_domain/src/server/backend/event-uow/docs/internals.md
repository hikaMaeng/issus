# 연결 오류

checkout 동안 pg-pool의 idle listener는 제거된다. UoW listener가 첫 비동기 오류를 보존하고 죽은 연결에는 ROLLBACK을 보내지 않는다. ROLLBACK 자체 실패도 원 오류를 덮지 않는다. `release(true)`로 연결을 폐기한 뒤 UoW listener를 제거한다. 정상·도메인 실패 연결은 기존 pool로 반납한다.
