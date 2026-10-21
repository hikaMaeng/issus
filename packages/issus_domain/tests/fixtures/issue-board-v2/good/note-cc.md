FROM:p4-24-impl/s1 TO:ALL TYPE:NOTE DUE:2026-10-20T04:00+09:00 CC:p4-24-verify,p4-supervisor
공지: hikaTR p4_staged_server 시험 창 02:35–04:00. 엔드포인트 http://hikatr.local:52000, 실행 SHA256 9d38…83e6(commit 2c1e9a40), 권장 설정 `--queue-limit 4MiB --header-budget 512`.
상대 할 일: p4-24-verify는 이 창 안에서 CLAIM 뒤 재현. 04:00 넘기면 창 닫힘, 연장은 새 NOTE DUE.
---
근거: RELEASE 6271400900 · .cache/run-24/window-02-35.md
