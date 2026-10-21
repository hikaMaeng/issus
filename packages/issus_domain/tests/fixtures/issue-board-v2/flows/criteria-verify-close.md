# (d) 기준 고정 DECISION → VERIFY → 최종 REPORT → COMPACT → 본문 done → 게시판 → close

1. 오케스트레이터 `decision-criteria.md` — 결과 **전에** (a)(b)(c) 판정·허용치·GATE 고정. 사용자 결정이 끼면 `decision-user.md`(원문 인용, SUPERSEDES, 원 기준/결정 후 병기).
2. 구현자 REPORT STATE:done → 검증자 `verify.md`(`RE:<report id>`, `VERDICT:` 1줄 + 기준별 표 + 근거 수준, 기각 가설 포함). 반론은 `ack-objection.md`.
3. OWNER 최종 `report-final.md`(TO:ALL, STATE:done, 기준별 VERDICT 표, 최종 REF, 남은 일).
4. OWNER `compact.md`(위임 경로 flows/compact.md) → 본문 `issue-body-closing.md`(`--edit-body`, COMPACT·BOARD 키) → 게시판 `board-note.md`(flows/board.md).
5. `gh issue close <n> --reason completed --comment "<최종 REPORT id>"`. 닫기 전: 미답 ASK 0, CLAIM 전부 RELEASE(closing.md).
