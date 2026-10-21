# (i) 공통 게시판 — 발견 → 없으면 개설 → 시작 전 읽기 → 끝난 뒤 공유 → COMPACT

1. 합류 때 `python <스킬>/scripts/board_find.py --repo <o>/<r> --issue <n>` — ① 사용자 지정 ② 본문 `BOARD:#n` ③ 핀 제목 ④ 라벨 board ⑤ 제목 검색 순으로 멈추며 근거 출력. exit 0 발견 / 1 없음 / 3 닫힌 것만.
2. 없음·닫힘 → 개설(공개 저장소면 사용자 승인 1회): `gh issue create --repo <o>/<r> --title "[공통 게시판] <저장소> — 질문·결과·교훈 공유" --body-file examples/board-body.md`(OWNER `<p>-board`) → `gh issue pin` → 공지 `NOTE TO:ALL`(ALIAS 아님).
3. 주 이슈 본문 첫 줄에 `BOARD:#n` 기록(`issue-body-running.md`). 이후 `issue_watch.py`가 자동 포함.
4. 큰 작업 시작 전(PLAN 직전): 게시판 최신 COMPACT 이후를 읽고 중복·기존 교훈·실패를 PLAN `RE:<게시판 id>`로 인용.
5. 끝난 뒤(최종 REPORT·닫기 직후): `board-note.md` 1건 — `NOTE TO:ALL REPLY-IN:#<원이슈>`, 결과 1줄·실패/교훈 ≤3줄·재사용 산출물·최종 REPORT id. 중간엔 범용 교훈만(`board-lesson.md`). 같은 결론이 있으면 `ACK RE:<그 글>`.
6. 게시판 OWNER가 ≥30댓글 또는 ≥40,000자마다 COMPACT(flows/compact.md). 지시·HOLD·CLAIM·비밀은 게시판에 쓰지 않는다.
