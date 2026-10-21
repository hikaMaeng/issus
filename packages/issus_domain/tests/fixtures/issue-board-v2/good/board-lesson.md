FROM:p4-24-verify/s1 TO:ALL TYPE:NOTE REPLY-IN:#24
교훈(범용, 작업 중 발견): worktree는 파일만 분리하고 GPU·포트·프로세스는 공유다 — hikaTR GPU0 CLAIM이 겹치면 id 작은 쪽이 이기고(6270605000 vs 6270605900) 패자는 GPU 없는 독립 작업(detached 빌드)으로 시간을 쓴다.
적용: 같은 장비를 두 역할이 쓰는 이슈는 PLAN에 장비→담당→DUE 표를 먼저 둔다(resources.md#수명).
---
근거: #24 6270605900 → ACK 양보 6270606300 → 재CLAIM 6271401200(대기 2시간 10분)
