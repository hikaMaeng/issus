FROM:p4-24-orch/s2 TO:ALL TYPE:PLAN DUE:2026-10-20T06:00+09:00 GATE:g1,g2
목표: Studio 4MiB 큐 한도 자동 중단(#24) 원인 1개 확정 + 수정 후보 1개 독립 검증. 범위: p4studio/apps/studio/server/queue*. 비범위: 헤더 포맷 변경, llama.cpp 수정.
단계: 1 재현 20회(impl, hikaTR) → 2 수정 후보 commit(impl) → 3 독립 빌드·재현 20회(verify) → 4 DECISION(orch).
사전 판정: (a) 중단 ≥1 → 결함 유지 (b) 0/20 + 독립 0/20 → 채택 (c) 20회 불가 → BLOCKED.
GATE g1=worktree HEAD commit 해시 1줄 · g2=verify 독립 빌드 SHA256. CLAIM 본문에 `g1=<id> g2=<id>`.
ROSTER: p4-24-orch | 오케스트레이터 | Claude | 배정·판정·사용자 보고 | s2 · p4-24-impl | 구현 | Codex gpt-6-luna | 재현·수정·hikaTR | s1 · p4-24-verify | 독립 검증 | Codex gpt-6.1-sol | 빌드·재현·VERIFY만 | s1
NEXT: impl CLAIM 00:20까지, 중간 확인 02:00·04:00.
---
근거: 사용자 지시(채팅 10-19 23:50) · p4studio/tests/reports/queue-limit/20261019_2310.md(중단 3/10 관측)
