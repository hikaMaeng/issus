# 구조

| 경계 | 책임 |
| --- | --- |
| `common/protocol/*/index.ts` | action·payload·응답·채널·프레임 타입 |
| `common/protocol/runtime/{parser,fact-parser}.ts` | action별 unknown key 거부·shape decoder |
| `common/validation/constants/index.ts` | 정본 상수와 Python 문자열/정규식 호환 |
| `common/validation/{comment,issue-body,alias,time}` | 문법 검증, metadata 요청 shape |
| `common/logic/*` | 분류·legacy pending·강화 ACK·전달 상태·통계·마스킹 |
| `common/domain/index.ts` | P3 공개 API 집계; 상위 barrel은 P1 소유 |
| `server/backend/schema` | baseline SQL·적용기 인터페이스, 실행 없음 |

서버/프런트가 wire 타입을 재선언하지 않는다. common은 Node/DB/프레임워크를 import하지 않는다. 검증 성공은 실제 존재·권한·기한·packet freshness를 보장하지 않는다. 문맥 검사는 P4~P6 UoW의 동일 트랜잭션에서 수행한다.

반응표의 구체 queue→handler 연결은 app 한 곳에 둔다. 여기서는 `QUEUES`, `REACTIONS_NAME`, `DomainReactionTable`만 제공한다. 원 fact 좌표는 반응 envelope top-level의 source 3개와 delivery payload의 원 댓글 source 3개를 구별한다.
