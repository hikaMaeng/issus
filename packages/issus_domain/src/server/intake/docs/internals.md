# P4 후속 트랜잭션

close 실행은 fence 검사 → before-close 제어 UoW → 기존 명령 UoW 순서다. 제어 tx는 인증·repo 접근·OWNER를 확인하고 owner→repo→issue 순으로 잠근다. 확정된 동일 key 재생과 닫힌 이슈는 관측을 반복하지 않는다. 도메인 권한/형식 거부는 기존 명령 결과 경로에서 처리하며 관측하지 않는다.

P6는 generation당 사유 발행을 제어한다. `CLOSE_BLOCKED`의 SAVEPOINT 롤백 및 close append의 전체 tx 롤백은 앞서 커밋한 compact_segment/due fact에 영향을 주지 않는다. 제어 tx 자체의 DB/append 실패는 전파되어 close를 실행하지 않는다. before-close 관측은 preflight의 무변경 계약과 별개다.

alias fact 생산자는 등록 요청 또는 개명 전 행에서 model을 가져온다. 재구축은 정본 fact의 필수 model만 사용하며 announcement 자유 문장을 파싱하지 않는다. P3 strict decoder와 wire sample 변경은 base 요청6310489014 소유다.
