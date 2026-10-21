# 사용

[요구](brief.md)와 [설계](design.md) §9.1 기준. npm install → npm run lint → npm run build → npm test → docker compose config. npm run deploy는 전체 4서비스, npm run deploy -- issus는 의존 DB를 포함한다. env.defaults와 선택적 docker/.env를 사용하며 기존 secret은 덮어쓰지 않는다. 포트 기본 18140/15440은 P1 착수 시 netstat에서 listener가 없었다. compose.env.example의 값을 shell 환경에 export하면 변경할 수 있다. runtime PORT는 ISSUS_PORT로 주입한다. 운영 secret과 인증은 후속 기능 통합 시 설정한다.
