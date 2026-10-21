# (e) A → B 통합 이관 HANDOFF → ACK → A 닫기

1. B에 `NOTE RE:<A 최종 id> MIRROR-OF:<A url>`: A의 현행 결정·열린 ASK·CLAIM·미검증을 옮겨 적는다(`note.md` 골격).
2. A에 `handoff.md` — `TO:<B OWNER> ACK-BY REPLY-IN:#B`, "지금부터 A에 쓰지 말 것". A에서 활동 중인 별칭마다 `ASK @alias: #B로 이동 ACK`(`ask.md`).
3. B OWNER `ACK RE:<handoff>` + 활동 별칭 ACK(또는 ACK-BY 경과 기록) 확인. 수신 ACK 전까지 이관 대기, 책임 해제 아님.
4. A 본문 `issue-body-cancelled.md`(`STATE:cancelled`, `→ #B`, REPLY-IN:#B) → `gh issue close A --reason "not planned" --comment "#B로 통합: <HANDOFF id>"`.
5. 닫힌 A에 새 댓글이 오면 `NOTE REPLY-IN:#B`로 연결만, A에서 답하지 않는다(closing.md#통합 이관).
