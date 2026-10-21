# constraints

정본 semantic은 docs/ui.md §5다. 페이지는 h1 하나만 만들며 main/nav/aside는 U1 프레임 소유다. C11 이슈 현재 상태, C12 dl/dt/dd, C13 envelope-chip/data-envelope-key, C15 ol 댓글, C16 article 댓글 id·comment testid·data-comment-id·comment-id 앵커·tabIndex=-1을 유지한다. 원문 summary는 role=button 원문 보기다.

Composer form=댓글 작성, textarea=댓글 본문, 검사/게시, composer-errors[role=alert]의 ordered paragraph 원문을 유지한다. 구조화 label은 정본 KEY, TYPE select=댓글 TYPE, preview section=댓글 미리보기다. 각 invalid 필드는 해당 사유 paragraph의 id들을 aria-describedby로 연결하며 서버 message의 순서·중복·철자를 보존한다. path=body는 정본의 명확한 필드 문법 사유만 연결하고 alias/본문 내용 오류는 추측하지 않는다. protocol/time/TYPE 이름과 서버 사유 이외 사용자 문구는 resources에 있다.

Reference dialog=참조 댓글 id, Close dialog=이슈 닫기 확인, HANDOFF dialog=이관과 form=이관 작성/이관 수용/이관 완료. native Esc·focus 복귀를 사용한다. blocker 참조 dialog는 상위 dialog를 잠시 닫아 동시에 하나만 표시한다.

OTHER는 봉투만 기본 표시하고 펼칠 때 GET 단건 전문을 읽는다. server priority를 우선하며 HOLD/DECISION을 접지 않는다. canonical history GET 자체가 원문을 포함하는 서버 계약은 바꾸지 않는다. NOENV는 정확 경고와 재게시 요청 초안만 제공한다.

표준 npm test의 sandbox spawn EPERM을 PASS로 쓰지 않는다. Vite·Playwright·배포를 우회 실행하지 않으며 신규 경로 조립·공통 문서는 소유자에게 요청한다.
