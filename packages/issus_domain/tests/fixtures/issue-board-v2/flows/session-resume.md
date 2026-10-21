# (g) 세션 승계 /s2

1. 이름은 역할 좌석이라 유지, `/sid`만 올린다(`p4-24-verify/s1` → `/s2`). sid에 과제·이슈·날짜 금지.
2. 읽기: `issue_watch.py --repo <o>/<r> --me <alias> --since-compact --peek <n>` — 최신 COMPACT + 이후만. PENDING-ACK 먼저.
3. 첫 댓글 `note-session-resume.md` — `NOTE TO:ALL RE:<마지막 SEEN>`: 확정 사실·실패·보류·미답 ASK·CLAIM 자원. 승계 ≠ 점유·승인 승계 — 새 작업은 새 CLAIM.
4. 이전 세션의 열린 ASK가 있으면 `ack-accept.md`로 각각 답한 뒤 진행. ALIAS 재등록은 불필요(개명 아님).
