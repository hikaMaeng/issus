FROM:p4-24-orch/s2 TO:p4-24-impl TYPE:DECISION ACK-BY:2026-10-20T00:20+09:00 CC:p4-24-verify,p4-supervisor GATE:g1,g2
결과가 나오기 전에 판정 기준을 고정한다. 결과 후 변경 금지, 빈틈은 `DECISION SUPERSEDES:<이 id>`로만.
DECISION: 4MiB 큐 한도 자동 중단 재현 20회 기준 — (a) 중단 1회 이상 → 결함 유지, 수정 후보 기각 (b) 0/20 + p4-24-verify 독립 재현 0/20 → 수정 후보 채택 (c) 20회 못 돌리면 → BLOCKED, 원인 기록
허용치: 헤더 크기 ≤0.5KB(기존 contract 상한 그대로, 새 숫자 없음). 참조 = 같은 pin upstream llama-server.
g1=worktree HEAD commit 해시 1줄 · g2=p4-24-verify 독립 빌드 바이너리 SHA256.
NEXT: p4-24-impl ACK → CLAIM(g1,g2 채움) → 실행.
---
근거: evidence.md#기준은 결과 전에 고정 · p4studio/docs/contracts/queue.md:41(헤더 상한 0.5KB)
