# 사용

`/repos`에서 세션 token을 연결한 뒤 저장소→이슈를 연다. 본문 첫 줄과 댓글 봉투를 dl로 읽고 최신 COMPACT 이후/전체를 토글한다. 댓글 본문을 입력해 검사→게시한다.422 사유는 원문이다.

/login?returnTo=<내부경로>는 cookie 교환 뒤 auth/me가 확인된 경우만 복귀한다. /sessions는 principal/만료와 관리 토큰을 직접 입력하는 발급 폼을 제공한다. 최초 발급 token은 기본 마스킹·한 번만 보관하며 복사/즉시 연결/지우기를 선택한다. 동일 key 재시도409는 명시 재발급 dialog에서 새 sid/reissueOf/새 key로 복구한다. 세션 종료는 에이전트 세션까지 철회한다.

목록 조건은 URL에 복원된다. ROSTER의 이슈 번호는 본문 ROSTER 출처를 선택하고, 등록 레지스트리 검색/상세는 별도 조회다. 관리 등록·개명은 ALIAS 공지 원문과 repo ID를 요구한다. 새 탭에 CSRF가 없으면 읽기만 가능하고 쓰기 전 토큰을 다시 연결한다.

`/inbox?repo=owner/repo&issues=N`은 token 별칭의 inbox다. 수신 확인 작성→미리보기→ACK 게시를 사용한다. 지시는 무시할 수 없다. 이슈 닫기 dialog에는 최종 REPORT id·사유를 넣으며 서버 blocker가 남으면 닫히지 않는다. [인증·Monitor·Codex 운영](../../../../../docs/usage.md)을 따른다.

inbox 필터는 repo·issues·반복 board·sinceCompact·transport다. 기본 WS가 실패해도 SSE로 자동 전환하지 않는다. `실시간 전송 방식`에서 SSE를 명시 선택하고 조회한다. PENDING-ACK(window)/GLOBAL과 ACK-STATE waiting은 별개이며 REPORT RE만으로 직접 ACK가 되지 않는다. ACK-BY 경과는 화면 시계의 예상 표시다.

실제 delivery의 `영수 확인`·`처리 완료 기록`·`반영 근거 기록`은 별도 행동이다. 반영에는 직접 ACK 뒤 본인 REPORT/VERIFY RE 원 지시의 ID를 넣는다. 미반영은 사유가 필요하며 상태를 로컬에서 applied로 바꾸지 않는다. 미확정 요청은 `기존 요청 다시 확인`으로 같은 payload/key를 재사용한다.

COMPACT 도우미는 purpose→패킷 준비→다운로드/검토→원문 열기와 표본 선택→요약/담당별칭 입력→검사→게시 순서다. 409/410 뒤에도 초안·대조 기록은 남고 새 준비는 명시 행동이다. 새 패킷에 맞춘 마커/SEEN/RE/footer는 사람이 확인한다. 서버 원문 사유를 피하려고 UI가 본문을 고치지 않는다.
