# (a) ASK → ACK → REPORT

1. 요청자 `ask.md` — TO 1명, ACK-BY 날짜 포함, 본문 `ASK @<TO>:` 1줄, 요청 1개. 둘이면 댓글 둘(`ask-slot-1.md` `ask-slot-2.md`).
2. 수신자 `ack-accept.md` — `RE:<ask id>`, 수용/반론/부분수용 + 1줄 근거. 반론은 `ack-objection.md`(충돌 근거·조건·질문).
3. 수신자 `report-progress.md`(STATE:running) → 끝나면 REPORT STATE:done. 요청이 "재게시"였으면 `SUPERSEDES:<원 id>`.
4. 요청자는 ACK-BY까지 ACK 없으면 직접 호출 + `NOTE RE:<ask id>` "직접 호출 <iso>"(delivery.md). 무응답 = 동의 아님.
