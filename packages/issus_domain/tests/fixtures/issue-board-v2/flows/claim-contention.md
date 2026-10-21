# (c) CLAIM 경합 → 패자 ACK 양보 → RELEASE → 재CLAIM

1. A `claim.md` — 자원·기준 commit·범위·접속 안 할 장비·복구 담당·GATE `g1=<id>`, 파괴적이면 `DESTRUCTIVE:`, `---` 아래 봉인.
2. B도 같은 자원 CLAIM → **comment id 작은 쪽 승**. B `ack-yield.md`(`RE:<승자 claim>`, STATE:queued, 대기 중 독립 작업).
3. A 원복 뒤 `release.md` — `RE:<claim id>`, 원복 증거(해시 일치·원 방식 재기동·잔류 0), "다음 담당 착수 가능: B".
4. B가 RELEASE 확인 후 재CLAIM(`claim.md` 복사, SEEN은 RELEASE id). CLAIM은 잠금이 아니다 — 착수 전 실제 상태 확인(resources.md#경합).
