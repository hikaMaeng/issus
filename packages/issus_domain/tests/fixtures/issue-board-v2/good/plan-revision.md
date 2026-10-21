FROM:p4-10-orch/s1 TO:ALL TYPE:PLAN DUE:2026-10-16T21:00+09:00 SUPERSEDES:6270558287 GATE:g1
개정(이전 계획 6270558287 대체, diff만): 장비 분할 추가 — #10 = Mac21(mobimac), #12 = Mac20. 시작 = #10 수정 실행 종료 후(≥18:30), 종료 후 원 release 복귀·INSPECT.
바뀐 단계: 1 Mac21 슬롯 CLAIM(p4-10-impl) → 2 management-v1 실기 → 3 복귀·INSPECT REPORT. 나머지 단계·사전 판정은 6270558287 그대로.
GATE g1=#12 OWNER가 Mac21 불사용 ACK(id). 없으면 착수 금지.
NEXT: p4-10-impl CLAIM DUE 21:00 전, 중간 확인 19:30.
---
근거: 사용자 지시 "새 버전 p4는 맥에서 테스트"(채팅 10-16 17:30) · 6270558287
