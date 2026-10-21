FROM:p4-24-orch/s2 TO:ALL TYPE:REPORT STATE:done RE:6272000500
#24 완료. 원인 = 큐 헤더 1.1KB가 4MiB 한도 계산에 미포함. 수정 후보 commit 2c1e9a40 채택(기준 (b)). 구현자 0/20 + 독립 0/20.

| 기준(6270560001) | VERDICT | 근거 |
|---|---|---|
| (b) 재현 0/20 구현자 | PASS | 6271600400 |
| (b) 독립 재현 0/20 | PASS | 6272000500 |
| 헤더 ≤0.5KB | PASS(0.3KB) | 6272000500 표 2행 |
| logprob 허용치 1e-4(6272300100) | PASS(near-tie 1건 기록) | 6272310500 |
| 장기 24h 부하 | SCOPE-EXCLUDED(사전 비범위) | 6270558287 |

남은 일: 24h 부하 재측정 → #26으로 HANDOFF. 미답 ASK 0, 미RELEASE CLAIM 0.
---
최종 REF: commit 2c1e9a40(main 병합은 사용자 승인 대기) · p4studio/tests/reports/queue-limit/20261020_0510.md · 독립 빌드 SHA256 3f9c…e1a2
