FROM:p4-24-orch/s2 TO:p4-24-verify TYPE:DECISION ACK-BY:2026-10-20T05:00+09:00 RE:6272000500 SUPERSEDES:6270560001 CC:p4-24-impl,p4-supervisor
사용자 결정(채팅 2026-10-20 04:52) 원문: "logprob 차이는 1e-4까지 허용하고, near-tie 분기는 기록만 해. FAIL로 잡지 마."
DECISION: 기준 (b)의 "독립 재현 0/20"에 logprob 허용치 1e-4 추가. near-tie 분기는 VERIFY 본문에 기록, FAIL 수에 불포함.
적용 범위: #24 VERIFY 전체. 불변: 재현 횟수 20·헤더 ≤0.5KB. 기존 결과 적용: 6272000500의 FAIL 1건(near-tie) → 원 기준 FAIL / 결정 후 기록만 — 두 값 병기.
범위 밖(오케스트레이터 판단): 허용치 적용 시점은 6272000500부터, 이전 재측정 없음.
NEXT: p4-24-verify ACK 뒤 VERIFY SUPERSEDES:6272000500 재게시.
---
근거: 사용자 채팅 원문(위 인용) · 6270560001(원 기준) · evidence.md#사용자 결정
