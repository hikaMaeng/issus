# P4 후속 시험

실제 PG18/PGMQ와 loopback HTTP를 쓰는 `apps/issus/src/server/http/auth/{core,fixtures}.test.ts`에서 DECISION6310243238을 검증한다. 고유 schema와 큐만 생성·정리한다.

- 댓글28 POST201, 본문4 PATCH200. 참조와 legacy alias를 먼저 생성하고 Clock을 역사 기한에 맞춘다. bad5 HTTP422와 golden 사유 전체 일치.
- 등록/개명 fact의 model 확인 → 프로필 열 초기화 → registered 재생만으로 model 복원 → renamed 반복 재생으로 active/tombstone 프로필 복원.
- 비OWNER close403은 due 생성0. 차단 close409 뒤 due/segment 보존과 동일 generation 중복0. 새 COMPACT 뒤 close append만 실패시켜 close/result 롤백과 due fact 보존을 확인한다.
- 고정 주입 Clock으로 browser cookie token·필수 속성·24h Expires를 검사한다. Date 전역 모킹은 없다.

`npm test/run lint`를 workspace별로 실행한다. 샌드박스의 test worker spawn EPERM이면 `.cache/p4-s3/validate.py`가 임시 JS emit 후 같은 node --test를 단일 프로세스로 실행하며 표준 runner 결과와 구별한다. 로그와 수치는 `.cache/p4-s3/` 및 s3 REPORT에 남긴다. 배포·브라우저 수용은 포함하지 않는다.
