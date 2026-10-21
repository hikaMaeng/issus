# issus baseline

`0001-domain-baseline.sql`은 design v2.1 §2의 도메인 schema이며 public broker schema/pgmq를 만들지 않는다. P4 migration 실행기가 advisory lock과 단일 트랜잭션에서 1회 적용한다. 적용 이력·checksum·SQL 파일 배포는 실행기 소유다. baseline은 동결 후 편집하지 않는다.

후속 파일: `0002-core-<변경>.sql`, `0003-deliver-<변경>.sql`처럼 4자리 전역 순번+담당명+설명. 순번은 이슈에서 예약한다. 이미 적용한 SQL을 고치지 않는다.

소유 범위는 composite FK로 검사한다. `owner_id`는 참조 범위 검사용 중복 열이다. repo.board_issue_id는 해당 repo의 issue number다. claim의 issue는 repo_id+issue_number, handoff의 source/target도 각각 복합 열이다. `comment_reference`는 §4.3 즉시 호환 참조 인덱스, `compact_packet`은 §6.2 opaque packet의 해시·snapshot 저장이다.

구문 DB 제약은 문법 검증을 대체하지 않는다. near alias 충돌은 owner lock 아래 TS 전수 검사, STATE OWNER UPDATED 순서·ACK/권한·COMPACT 검증은 UoW 책임이다. comment는 UPDATE/DELETE trigger로 불변이다. body 중복 후보 인덱스는 비고유 MD5다. issue lock 아래 후보 원문 바이트를 비교하며 digest만으로 동일 본문이라고 판정하지 않는다. bigint는 TS/JSON에서 문자열이다. comment_counter는 FOR UPDATE 후 갱신하고 COMMIT까지 유지한다.

테스트는 `ISSUS_TEST_DATABASE_URL`의 격리 schema에 baseline을 적용하고 rollback/drop한다. 운영 issus/public은 수정하지 않는다.

owner 이름의 casefold unique는 PostgreSQL 18 `casefold(... COLLATE pg_catalog."pg_unicode_fast")`를 사용한다. libc의 lower와 같은 동작에 의존하지 않는다. [PostgreSQL 18 문자열 함수](https://www.postgresql.org/docs/18/functions-string.html), [collation](https://www.postgresql.org/docs/18/collation.html).
