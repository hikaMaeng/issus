# internals

`entry/arguments`는 비반복 옵션 중복을2로 거부하며 me/mine/board만 누적한다. alias·board·compact는 check/find/prepare를 생략할 수 있다. 원문 파일은 fatal UTF-8 decode와 ignoreBOM으로 읽어 BOM을 validator까지 보존한다.

scope key는 서버+owner+token alias/sid+정렬 repo/issues/boards+me 집합+sinceCompact다. 같은 state 파일에서도 scope가 섞이지 않는다. Python timestamp map은 native cursor로 변환하지 않고 첫 snapshot으로 다시 읽는다.

| 상태 | commit 규칙 |
| --- | --- |
| paginationCursor | 현재 immutable snapshot 페이지 |
| refreshCursor | 모든 페이지+출력 성공 후만 교체 |
| processedCursor | 서버가 반환한 처리 prefix; GET으로 생성하지 않음 |
| transportCursor | event 출력+해당 receipt 성공 뒤 저장, pull cursor와 교환 금지 |

InboxModel은 viewKey로 history/inbox를 병합하고 deliveryId+aliasEventSequence로 같은 attempt의 state 갱신도 upsert한다. 오래된 sequence는 최신 상태를 덮지 않는다. watch `--full`은 접힌 OTHER를 immutable comment 단건으로 복원한다. pending은 API의 호환 window/global 집합이며 ackState로 대체하지 않는다.

subscribe는 eventId dedupe·stream별 sequence를 사용한다. 1001/1013·일시 장애는 기존 subscription을 닫고 generation별 새 key/구독을 만든 뒤 backoff한다. 재실행도 저장된 구독 ID를 재사용하지 않는다. 같은 scope/channel의 마지막 확정 cursor만 승계한다. auth1008·잘못된 frame은 종료한다. cursor 만료·scope 변경은 새 snapshot을 발급하고 ordering 경계를 초기화한다. once는 delivery 영수와 저장 뒤만 종료한다. until은 공통 AbortSignal로 연결·SSE read·영수·backoff를 중단하고 exit3으로 번역한다. once/취소/만료는 subscription만 닫으며 마지막 transport cursor를 보관한다. 출력/파일 실패시 event cursor를 전진시키지 않는다.

상태 변경은 lock+동일 디렉터리 temporary+rename, UTF-8(no BOM)/LF다. profile permission 설정 실패시 비밀을 temporary에 쓰기 전에 종료한다. raw token을 저장하는 유일한 파일은 profiles이며 session token API 응답은 메모리에서만 취급한다.
