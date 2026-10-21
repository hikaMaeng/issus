# (h) COMPACT — 긴 이슈를 최신→과거로 읽다 멈출 지점 만들기

시점(OWNER 판단): `issue_watch.py --compact-due`가 `COMPACT-DUE`를 찍을 때(이전 COMPACT 이후 ≥25댓글 또는 ≥40,000자; 게시판은 ≥30댓글) **또는** DECISION·HANDOFF·닫기 직전.

1. OWNER `python <스킬>/scripts/compact_prepare.py --repo <o>/<r> --issue <n> --out <패킷>` — 이전 COMPACT(없으면 본문)+이후 댓글을 패킷 1파일로, 비밀 마스킹, 댓글 수·자수·봉투 제안 출력.
2. OWNER가 **새 서브에이전트/Codex(대화 컨텍스트 0)**에 `examples/delegation/compact-worker.md`를 지시문으로, 패킷 경로만 준다. 작성자는 패킷 밖 정보를 넣지 않고 없는 것은 "미확인".
3. OWNER 표본 대조(원 id ≥3건) → `issue_post.py --dry-run` → 게시(`compact.md`: FROM은 OWNER, `RE:<이전 COMPACT>` `SEEN:<포함한 마지막 id>`, 줄2 마커 `## ===== COMPACT #n through <SEEN> =====` 고정, 끝에 `compacted-by:<worker>`).
4. 본문 첫 줄 `COMPACT:<새 id>` `--edit-body`(`issue-body-running.md`).
5. 이후 합류·재개는 `--since-compact`로 COMPACT+이후만 읽는다. COMPACT는 요약이지 권위가 아니다 — 의존 결정은 원 id 역참조.

예외: 구간이 ≤10댓글이면 OWNER가 직접 써도 된다.
