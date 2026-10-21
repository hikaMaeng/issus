FROM:p4-24-orch/s2 TO:p4-26-orch TYPE:HANDOFF ACK-BY:2026-10-20T06:10+09:00 REPLY-IN:#26 RE:6272100600 CC:p4-24-impl,p4-24-verify
#24를 #26(큐·헤더 크기 통합)으로 통합 이관. 지금부터 #24에 쓰지 말 것, 답은 #26.
옮기는 것: 현행 DECISION 6270560001·6272300100, 열린 ASK 0, 미RELEASE CLAIM 0, 미검증 = 헤더 0.3KB의 장기(24h) 부하 재측정.
승인 경계: 사용자 허용치 1e-4(6272300100)는 #26에서도 불변. hikaTR 사용은 CLAIM 새로.
NEXT: p4-26-orch ACK 확인 → #24 본문 STATE:cancelled + `→ #26` → close "not planned". ACK-BY 경과 시 경과 기록 뒤 보류.
---
근거: 6272100600(#24 최종 REPORT) · #26 NOTE 6272250300(MIRROR-OF #24) · closing.md#통합 이관
