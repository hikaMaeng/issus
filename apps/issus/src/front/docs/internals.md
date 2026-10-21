# 내부

connectBrowser는 bearer를 HttpOnly cookie로 교환하고 입력을 비운다. CSRF는 동일 origin fetch wrapper가 쓰기에 첨부한다. history는 고정 cursor page를 끝까지 읽고4개 병렬 단건 조회로 본문/시간/validity를 보강한다. COMPACT는 id로 중복 제거 후 시간순 표시한다.

inbox는 immutable snapshot을 InboxModel에 넣고 화면은 ME/CC/ALL/OTHER 순으로 정렬한다. SSE receipt가 confirmed transport만 기록한다. 명시 ACK 버튼은 원 지시 RE와 token alias/sid로 전문을 미리 보여 준다. close는 현재 revision을 If-Match로 보낸다.

cookie client는 CSRF 없는 쓰기를 요청 전에 거부한다. bootstrap/session bearer의 직접 요청은 이 proof 검사와 분리한다. App은 auth/me 복구·focus/30초 재확인·expiresAt timer·cookie401을 처리하며 확인 전 connected를 표시하지 않는다. 세션 identity 변경은 view key를 바꿔 이전 scope를 새 FROM으로 게시하지 않는다.

이슈 목록과 보조 진단은5초마다 읽는다. 목록은 성공한 전체 page 결과를 교체하며 갱신 중 기존 행을 유지한다. Q2 cursor는 목록 고정 snapshot을 보장하지 않으므로 댓글 history의 immutable cursor와 구별한다. ROSTER parser는 명시 ROSTER 블록의5열 행만 추출하며 registry 권위로 승격하지 않는다.
