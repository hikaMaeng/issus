# 사용

`/repos`에서 세션 token을 연결한 뒤 저장소→이슈를 연다. 본문 첫 줄과 댓글 봉투를 dl로 읽고 최신 COMPACT 이후/전체를 토글한다. 댓글 본문을 입력해 검사→게시한다.422 사유는 원문이다.

/login?returnTo=<내부경로>는 cookie 교환 뒤 auth/me가 확인된 경우만 복귀한다. /sessions는 principal/만료와 관리 토큰을 직접 입력하는 발급 폼을 제공한다. 최초 발급 token은 기본 마스킹·한 번만 보관하며 복사/즉시 연결/지우기를 선택한다. 동일 key 재시도409는 명시 재발급 dialog에서 새 sid/reissueOf/새 key로 복구한다. 세션 종료는 에이전트 세션까지 철회한다.

목록 조건은 URL에 복원된다. ROSTER의 이슈 번호는 본문 ROSTER 출처를 선택하고, 등록 레지스트리 검색/상세는 별도 조회다. 관리 등록·개명은 ALIAS 공지 원문과 repo ID를 요구한다. 새 탭에 CSRF가 없으면 읽기만 가능하고 쓰기 전 토큰을 다시 연결한다.

`/inbox?repo=owner/repo&issues=N`은 token 별칭의 inbox다. 수신 확인 작성→미리보기→ACK 게시를 사용한다. 지시는 무시할 수 없다. 이슈 닫기 dialog에는 최종 REPORT id·사유를 넣으며 서버 blocker가 남으면 닫히지 않는다. [인증·Monitor·Codex 운영](../../../../../docs/usage.md)을 따른다.
