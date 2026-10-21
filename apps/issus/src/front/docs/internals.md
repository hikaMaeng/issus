# 내부

connectBrowser는 bearer를 HttpOnly cookie로 교환하고 입력을 비운다. CSRF는 동일 origin fetch wrapper가 쓰기에 첨부한다. history는 고정 cursor page를 끝까지 읽고4개 병렬 단건 조회로 본문/시간/validity를 보강한다. COMPACT는 id로 중복 제거 후 시간순 표시한다.

inbox는 immutable snapshot을 InboxModel에 넣고 화면은 ME/CC/ALL/OTHER 순으로 정렬한다. SSE receipt가 confirmed transport만 기록한다. 명시 ACK 버튼은 원 지시 RE와 token alias/sid로 전문을 미리 보여 준다. close는 현재 revision을 If-Match로 보낸다.
