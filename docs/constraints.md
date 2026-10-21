# 제약

[설계](design.md)·[정본 고정물](../packages/issus_domain/tests/fixtures/issue-board-v2/manifest.json)을 따른다. 첫 줄 키·13 TYPE·8 STATE·별칭 regex·오류 원문·마커·임계는 앱에서 재정의하지 않는다. UI 카피는 [resources](../apps/issus/src/front/resources/index.ts) 한국어 키이며 서버 reason·사용자 본문은 원문이다.

cookie 쓰기는 same-origin+CSRF, native HTTP는 bearer다. 세션 token은 최초1회 발급하고 서버에는 hash만 둔다. inbox·receipt·process는 token alias 소유다. 반복 me/mine은 canonical 관찰 집합이며 타인 delivery 소유권을 주지 않는다. Markdown은 inert pre로 표시한다. NOENV는 읽기 전용이며 네이티브 게시로 만들지 않는다.

| 영역 | 고정 semantic 계약 |
| --- | --- |
| 페이지 | main1·h1 하나, navigation `주 탐색`; loading=status+aria-busy, error=alert |
| 이슈 목록 | table `이슈 목록`, data-testid=issue-row+data-issue-number, row 안 `#N 제목` link |
| 본문 | region `이슈 현재 상태`, dl의 STATE/OWNER/UPDATED/COMPACT/BOARD |
| 댓글 | ol `댓글`, article `댓글 <id>`, data-testid=comment+data-comment-id, dl·time·`원문 보기` |
| COMPACT | 실제 마커 h2, data-testid=compact-marker, `구간 요약`, toggle aria-expanded |
| NOENV | alert `[NOENV] 봉투가 없어 실행할 수 없습니다` |
| 작성 | form `댓글 작성`, label `댓글 본문`, `검사`/`게시`, invalid+describedby·원문 reason |
| inbox | region `받은편지함`, data-testid=delivery+data-delivery-id, 분류·상태 텍스트 |
| 처리 | item `수신 확인 작성`/`무시 사유 기록`, 고유 dialog·명시 ACK 미리보기 |
| 닫기 | `이슈 닫기`, dialog `이슈 닫기 확인`, `닫기 실행`, blocker id alert |

시험 selector는 role/label/testid만 쓴다. CSS/XPath·DOM 깊이·nth/first/last는 locator 계약이 아니다. legacy fixture는 별도 issus_test_p8_* schema·배포 시험 instance에서만 주입한다. 제품 DB import endpoint·비밀 파일 접근은 추가하지 않는다.

네트워크는 프로젝트 bridge internal:false·loopback 공개, compose1개다. 자동 prune·volume 삭제·타 프로젝트 정리·GitHub 미러는 기본 기능에 없다. transport receipt와 ACK, applied와 외부 작업 성공을 구별한다. 미실행 Docker·브라우저·Monitor·복구는 PASS로 계산하지 않는다.
