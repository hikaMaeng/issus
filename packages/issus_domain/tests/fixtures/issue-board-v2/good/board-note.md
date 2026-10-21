FROM:p4-24-orch/s2 TO:ALL TYPE:NOTE REPLY-IN:#24
완료 공유 #24: Studio 4MiB 큐 자동 중단 원인 = 헤더 1.1KB가 한도 계산에 미포함. commit 2c1e9a40 채택(구현자 0/20 + 독립 0/20, 헤더 0.3KB).
실패·교훈: ① "큐 flush 타이밍" 가설은 8755b0e0에서 재현 3/10 유지로 기각 ② 구현자 바이너리 재사용 없이 같은 commit을 독립 빌드해야 (b) 판정이 선다 ③ 허용치(1e-4)는 결과 전에 사용자 결정으로 고정해야 near-tie 분쟁이 없다.
재사용 산출물: fixtures/queue-4mib.json(재현 입력) · p4studio/tests/reports/queue-limit/20261020_0510.md(하네스 절차) · .cache/wt-24-verify/ref-diff.txt(참조 대조 방법)
---
원이슈 최종 REPORT 6272100600 · VERIFY 6272310500 · 후속 #26
