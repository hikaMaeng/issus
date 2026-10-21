# constraints

DATABASE_URL 기본값·내장 비밀번호·자동 secret 탐색이 없다. 도메인 wire 타입과 규칙은 issus_domain, 공통 기동 연결은 issus_runtime에 둔다. 외부 의존성은 exact pg8.23.1/env-schema8.0.1이며 manifest 변경은 P1 요청이다.

서비스 `/srv`에는 외부 token을 발급하지 않는다. alias별 활성 writer1개, `(alias,sid)` 재사용 금지, explicit reissue는 기존 revoke와 새 hash를 동일 tx로 저장한다. 발급키 재시도 예외는 세션 token 발급에만 적용된다. 모든 API/이벤트/로그는 원 token을 제외한다.

migration 파일은0001부터 연속된 번호로 추가한다. 이미 적용한 SQL의 checksum을 변경하지 않는다. baseline 원본은 P3 소유이며 수정하지 않는다. 기본 schema issus/broker public; 시험은 `issus_p4_*`와 전용 큐만 사용·정리한다. 운영 컨테이너/볼륨은 종료하지 않는다.
