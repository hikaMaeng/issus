# 사용

[요구](brief.md)와 [설계](design.md) §9.1 기준. npm install → npm run lint → npm run build → npm test → docker compose config. npm run deploy는 전체 4서비스, npm run deploy -- issus는 의존 DB를 포함한다. env.defaults와 선택적 docker/.env를 사용하며 기존 secret은 덮어쓰지 않는다. compose.env.example의 값을 shell 환경에 export하면 포트를 변경할 수 있다. runtime PORT는 ISSUS_PORT로 주입한다.

`npm run deploy`는 `scripts/prepare-bootstrap.mjs`로 bootstrap secret을 최초 1회 만든다. 기본 위치는 gitignored `apps/issus/docker/volumes/bootstrap-token`, 변경은 `ISSUS_BOOTSTRAP_TOKEN_SOURCE`다. 기존 파일은 metadata만 확인하며 내용을 읽거나 교체하지 않는다. 신규 파일은 사용자 전용 권한 설정 성공 후 CSPRNG32byte를 저장한다. Compose는 이를 broker의 `/run/secrets/issus-bootstrap-token`에 read-only로 mount한다. 로그는 경로와 생성 여부만 표시한다. 별도 compose 기동 전에는 호스트에서 `node scripts/prepare-bootstrap.mjs`를 먼저 실행한다.

broker는 migration·bootstrap 뒤 HTTP/WS/SSE와 reactions를 연다. worker는 intake·route·delivery·compact, scheduler는 schedule 큐와 5초 tick을 담당한다. `ISSUS_WAKE_ADAPTER=disabled`가 기본이며 외부 깨우기는 별도 운영 설정이다. Docker·브라우저·Monitor 실기 수용은 [wave3 조립 계획](../tests/plans/wave3-assembly-20261021.md)에 따라 호스트에서 수행한다.
