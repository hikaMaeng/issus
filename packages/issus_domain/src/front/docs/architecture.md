# 구조

`client/http`: request/write와 구조화 오류, `client/stream`: subscription·receipt·reconnect. `model/cursor`: scope identity·bigint sequence, `model/inbox`: immutable 페이지와 delivery 갱신, `model/stream`: SSE parser·event dedupe/순서.

common protocol/validation은 P3 소유로 직접 재정의하지 않는다. workspace 소비자는 `issus_domain/front`만 import하며 파일·profile 저장은 CLI가 담당한다. WS factory는 async iterable+send+close 계약이다.
