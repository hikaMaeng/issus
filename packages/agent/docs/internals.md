# 내부 계약

## 저장

`event_store`는 eventId PK와 `(stream_id,sequence)` unique다. sequence counter row를 append tx에서 증가시키며 동일 eventId는 기존 envelope로 수렴한다. `source_event_id/source_stream_id/source_sequence`가 반응 출처를 저장한다. pg_notify는 commit 때만 전달된다. 신규 issus DB용 DDL이며 legacy 이벤트 UPDATE/backfill은 수행하지 않는다. schema 초기화 lock도 전용 client의 tx에 묶는다.

`event_subscription_cursor`에는 UUID·scope·정렬 channel set·positions·created_at·expires_at만 넣는다. 프레임마다 INSERT하고 기존 token을 UPDATE하지 않는다. `event_reader_cursor`는 반응 loop의 durable page checkpoint이며 처리 ACK와 무관하다.

## 반응·실행

최초 reader가 없으면 `{}`를 저장한다. 저장된 빈 위치도 유효하다. page의 모든 fanout send가 성공한 뒤 위치를 저장하므로 crash는 중복을 만들 수 있어도 누락시키지 않는다. 반응 identity는 `deterministicEventId("react:"+queue+":"+fact.eventId)`다. 원 source3개는 queue→draft→event_store→worker/channel parser에 보존된다. 재구축은 같은 `createReactionWork`를 사용한다.

`ExecutionStore`는 claim/lease/fence/result를 보관한다. transient 실패는 attempt 수와 관계없이 release 후 재시도한다. 도메인 거부만 `{ok:false,error}` 결과로 종결한다. 실행이 이미 완료되어 result append만 실패하면 완료 결과를 재사용하고 queue 원본을 보존한다. 완료 row에 result가 없으면 새 실패 결과를 만들어 덮지 않고 원본을 남긴다.

## 전송

socket send callback은 연결 메모리만 갱신하며 기존 UUID/처리 cursor에 쓰지 않는다. hub 구독과 buffer가 먼저 설치되고 tail seed 완료 뒤 high-water를 잡는다. 256건 재생이 incomplete면 live 구독을 해제하고 마지막 수신 snapshot으로 재구독한다. 준비/구독/이벤트/재생/오류 프레임은 `common/protocol/channel`을 따른다.
