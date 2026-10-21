# 내부

connectBrowser는 bearer를 HttpOnly cookie로 교환하고 입력을 비운다. CSRF는 동일 origin fetch wrapper가 쓰기에 첨부한다. history는 고정 cursor page를 끝까지 읽고4개 병렬 단건 조회로 본문/시간/validity를 보강한다. COMPACT는 id로 중복 제거 후 시간순 표시한다.

inbox는 immutable snapshot을 InboxModel에 넣고 active HOLD→legacy pending→ME/CC/ALL/OTHER 순으로 정렬한다. 그룹 안에서는 ACK-BY, 이후 bigint ordinal 순이다. 표시 순서를 cursor로 사용하지 않는다. 명시 ACK 버튼은 원 지시 RE와 principal alias/sid로 전문을 미리 보여 준다. close는 현재 revision을 If-Match로 보낸다.

cookie client는 CSRF 없는 쓰기를 요청 전에 거부한다. bootstrap/session bearer의 직접 요청은 이 proof 검사와 분리한다. App은 auth/me 복구·focus/30초 재확인·expiresAt timer·cookie401을 처리하며 확인 전 connected를 표시하지 않는다. 세션 identity 변경은 view key를 바꿔 이전 scope를 새 FROM으로 게시하지 않는다.

이슈 목록과 보조 진단은5초마다 읽는다. 목록은 성공한 전체 page 결과를 교체하며 갱신 중 기존 행을 유지한다. Q2 cursor는 목록 고정 snapshot을 보장하지 않으므로 댓글 history의 immutable cursor와 구별한다. ROSTER parser는 명시 ROSTER 블록의5열 행만 추출하며 registry 권위로 승격하지 않는다.

U3 갱신은 이전 조회 AbortSignal을 폐기하고 inboxThroughEventSequence가 낮은 응답을 거부한다. 이전 delivery E/attempt와 새 snapshot을 P7 upsert로 합쳐 상태 후퇴와 중복을 막는다. scope 바뀜은 모델을 초기화한다. 스트림 이벤트는150ms로 조회 무효화를 합치고 영수는 P7이 각 프레임 계약대로 보낸다.

DeliveryWrite는 미확정 path/body/key를 structuredClone하여 잠근다. 0/5xx/OperationTimeout 뒤 다른 초안을 새 요청으로 내보내지 않고 최초 요청을 확인한다. COMPACT는 게시 응답 후 pointer 재조회가 실패해도 확인한 commentId를 기억해 같은 요약을 재게시하지 않는다. 본문·표본·metadata는 서버에 전달할 때 trim/마커 자동 교정하지 않는다.
