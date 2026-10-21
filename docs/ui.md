# 사람용 웹 UI 명세

버전: P9 v1.1 · 2026-10-21 · 작성: `issus-1-ui/s2`(s1 승계). 명세 VERIFY PASS 6314230314·개정/구현 승인 DECISION 6314230980. 화면 13개(라우트 화면 11개·대화상자 2개), 컴포넌트 48개. 구현·배포·브라우저 수용 결과를 뜻하지 않는다.

## v1→v1.1 변경 요약

| 리뷰 항목 | 확정 계약 | 절 |
| --- | --- | --- |
| P1 분할 | 신규 폴더·resources 파일 소유, 교차 export 타입·조립 담당, U3의 U2 선행 의존을 고정 | §9·§10 |
| P1 대비 | inline code 전경을 #ff7b83으로 확정, #2a2a2a 배경의 작은 글자 AA ≥4.5:1을 판정 | §4·§11 P9-24 |
| P2 편집 | S09/S10 editable/readonly/미제공; OWNER 변경은 HANDOFF, 포인터는 COMPACT | §3 |
| P2 시험 | HOLD/DECISION 빠른 응답·CLAIM/RELEASE 정상/422와 ACK/DUE만으로 해제하지 않음을 기존 ID에 확장 | §11 P9-10·P9-16 |

## 1. 정본·범위·승인 경계

`docs/design.md` v2.3의 §5·§7·§8·§14, `apps/issus/docs/api.md`, 실제 HTTP 라우트, P8 front와 `apps/issus/tests/browser/ui.test.mjs`를 기준으로 한다. brief 요구 5의 사람 개입 UI 확대는 위 DECISION을 따른다. 서버 API·TYPE·검증·전달 상태·COMPACT 규칙을 바꾸지 않는다. 이 문서의 `/login` 등은 브라우저 경로이며 새 HTTP API를 뜻하지 않는다.

P8 RELEASE6314079411과 DECISION6314230980으로 §10의 U1 소유가 인계되었다. 구현은 아래 단위 경계로 진행한다. root manifest·barrel·production route 조립은 P1 경계다. 커밋·push는 오케스트레이터 책임이다.

규약 정본은 `C:/Users/hika0/.claude/skills/issue-board-collab`의 `references/{envelope,types,body,reading,delivery,compact,resources,board,join-naming}.md`와 `scripts/{issue_post,issue_watch,alias_check,compact_prepare}.py`다. 봉투·enum·오류 문자열은 기존 `issus_domain/common`의 이식본을 재사용한다. 프런트에 다른 규약 validator를 만들지 않는다. 마크업은 `headless-browser-markup`의 semantic 계약, 폴더는 `monorepo-architecture-guard`의 변경 단위 분해를 따른다. 지정 codex 경로에 없던 monorepo 스킬은 `C:/Users/hika0/.agents/skills/monorepo-architecture-guard/SKILL.md`에서 읽었다.

API 공백은 §8 Q1·Q2 두 건이다. 승인 전에는 지원되지 않는 API를 호출하거나 클라이언트가 등록·권한·완전한 필터 결과를 추측하지 않는다. 해당 화면은 공백 이유와 가능한 동작을 제공한다. 명세 완료와 Q1·Q2 기능 수용을 구분한다.

## 2. 정보 구조와 공통 프레임

좌측 고정 사이드바 → 중앙 작업 영역 → 우측 보조 패널 순서다. 사이드바에는 저장소 선택과 **저장소·이슈·받은편지함·게시판·ROSTER** 링크, 하단에는 현재 별칭/sid·세션 메뉴를 둔다. 저장소가 없으면 저장소 종속 링크는 선택을 안내한다. 링크는 실제 `a href`, 현재 위치는 `aria-current="page"`다. 브라우저 뒤로/앞으로·직접 URL 진입을 지원한다.

중앙은 페이지마다 `main`·`h1` 각각 하나다. 이슈 화면 우측 `aside`는 STATE·OWNER·OPEN-ASK·active HOLD·CLAIM/DUE·HANDOFF·COMPACT due를 보여 준다. 활성 HOLD·대기 ACK는 본문을 가리지 않는 고정된 경보 영역에도 텍스트로 노출한다. OPEN-ASK/CLAIM은 서버 diagnostics와 본문 원문을 출처별로 구분하고, 본문 텍스트를 서버 판정으로 승격하지 않는다. 선택 댓글을 보조 패널에 복제해 article/locator를 중복 생성하지 않는다.

기본 데스크톱 폭 1440px: 사이드바 232px, 우측 288px, 간격 16px, 중앙은 남은 폭(최소 목표 560px). 헤더 48px, 목록 행 최소 36px, 패널 내부 16px, 컨트롤 높이 32px, 기본 글자 14px/1.5. 각 영역 스크롤 시 포커스 윤곽을 자르지 않는다. 1200px 미만에서는 우측 정보를 중앙의 접기 영역으로 옮긴다. 900px 미만 또는 200% 확대에서는 사이드바를 이름 있는 열기 버튼과 native dialog로 제공하고 중앙 한 열로 전환한다. DOM에 동일 영역을 두 벌 두지 않는다. 표와 긴 코드만 자체 가로 스크롤하며 필수 행동은 가로 스크롤 밖에서 접근 가능해야 한다.

### 화면 목록

`o/r`는 owner/repo, `n`은 이슈 번호다. 아래 13개를 화면 수의 기준으로 센다. 작성기·ACK·영수·반영 폼은 해당 화면의 컴포넌트이므로 별도 화면으로 중복 계산하지 않는다.

| ID | 브라우저 경로 / 진입 | 역할·주요 결과 | 이용 주체·제약 |
| --- | --- | --- | --- |
| S01 | `/login` 및 비인증 시 기존 `세션 연결` 영역 | 세션 토큰 연결, 연결 후 원래 내부 경로 복귀 | 모든 방문자; 이름·비밀번호 가입 없음 |
| S02 | `/sessions` | 현재 별칭/sid/만료, bootstrap의 발급·명시적 재발급, 별칭 전환 | 발급은 bootstrap bearer 필요, 기존 세션 권한으로 가장 불가 |
| S03 | `/repos` (`/` 유지) | 접근 가능한 저장소 목록·선택, bootstrap 저장소 개설 폼 | 인증 principal의 repo grant 범위 |
| S04 | `/repos/:o/:r/issues` | 열림/닫힘·STATE·OWNER·참여 별칭·검색·정렬, 이슈 개설 진입 | Q2 전 지원 범위를 명시 |
| S05 | `/repos/:o/:r/issues/:n` | 본문·봉투·댓글·작성기·빠른 응답·상태 보조 패널 | 관찰과 게시 권한을 구분 |
| S06 | `/inbox?repo=o/r&issues=1,2` | 별칭별 PENDING-ACK·전달 상태·영수·ACK·반영 근거 | 인증 별칭의 inbox, 타 별칭 선택은 세션 전환 |
| S07 | `/repos/:o/:r/board` | 공통 게시판 발견·읽기·NOTE/ACK·ROSTER 접근 | registry 포인터 충돌·닫힘은 오류로 표시 |
| S08 | `/owners/:o/aliases?repo=o/r&issue=n` | ROSTER·별칭 registry·충돌 검사·등록/개명 진입 | Q1 전 ROSTER 출처와 부분 목록 표시 |
| S09 | `/repos/:o/:r/issues/new` | 제목·본문 첫 줄·GOAL/SCOPE/NON-SCOPE·미리보기·개설 | 등록 OWNER·접근 가능한 BOARD/참조 필요 |
| S10 | `/repos/:o/:r/issues/:n/edit` | 현 revision 기준 본문 편집·검사·변경 비교 | OWNER 등 서버 권한, If-Match 필수 |
| S11 | S05의 `이슈 닫기` native dialog | 최종 REPORT·닫기 사유·차단 목록·닫기 | OWNER/bootstrap; 요청 성공 전 열린 상태 유지 |
| S12 | S05의 `이관` native dialog | HANDOFF 작성 → 직접 ACK → accept → complete | 발신자·실제 TO·OWNER별 가능한 단계만 활성 |
| S13 | `/repos/:o/:r/issues/:n/compact` | due·준비·패킷 다운로드·표본 대조·COMPACT 게시 | OWNER/감독/bootstrap의 서버 권한, 실제 게시는 서버 검사 |

## 3. 화면별 동작

### S01·S02: 로그인·토큰 발급·별칭/sid

S01은 P8 `form name=세션 연결`, `세션 토큰` password 입력과 `연결` 버튼을 유지한다. 연결 순서는 session bearer로 `POST /v1/auth/browser-session` → HttpOnly cookie 수신 → CSRF만 `sessionStorage['issus.csrf']` 저장 → 입력 bearer 제거 → `GET /v1/auth/me`다. alias/sid/만료를 확인하기 전 연결 완료로 표시하지 않는다. 기존 cookie가 있으면 먼저 auth/me로 복구한다. bearer를 local/session storage·URL·분석 로그에 저장하지 않는다. return 경로는 같은 origin 내부 경로만 허용한다.

S02는 현재 principal의 alias·sid·sessionId·expiresAt을 보여 준다. 기존 토큰으로 다른 별칭을 선택하는 것만으로 FROM이나 inbox를 바꿀 수 없다. 별칭 전환은 다른 세션 토큰 연결 또는 운영자의 명시 발급 뒤 새 cookie 교환이며, 전환 시 구독·커서·draft의 scope를 분리하고 이전 세션 댓글 초안을 새 FROM으로 몰래 게시하지 않는다. 만료/철회 401은 비인증 화면과 재연결 행동으로 연결한다. cookie는 유효하지만 CSRF가 없는 새 탭에서는 읽기를 허용하고 쓰기는 `쓰기 전에 세션 토큰을 다시 연결해 주세요`로 안내한다.

발급 영역은 bootstrap bearer를 사용자가 password 입력에 직접 제공하는 관리 폼이다. UI가 secret 파일을 읽지 않는다. bootstrap bearer는 해당 관리 호출의 메모리에만 두고 닫기/성공/페이지 이탈 시 제거한다. bootstrap은 browser-session 교환 대상이 아니며 일반 세션 cookie와 혼동하지 않는다. 별칭 선택은 Q1 승인 전 현재 principal·이슈 ROSTER에서 얻은 후보와 직접 입력을 제공하되 `ROSTER 후보 · 등록 여부 미확인`을 표시한다. 충돌 검사는 **등록 가능성** 검사이므로 존재하는 별칭의 사용 권한 검증으로 쓰지 않는다. 서버의 session 발급 결과만 확정이다. 기본 sid 제안은 `s1`, 실제 중복 여부는 서버가 판단한다.

발급 요청은 `{alias,sid,resumeFrom?}`와 UUID key, 최초 201의 token은 1회 표시·복사 또는 즉시 연결을 선택한다. 복사 실패를 성공으로 표시하지 않는다. 토큰 표시 영역은 기본 마스킹, 인증 화면 캡처·trace의 secret 영역은 마스킹한다. `SESSION_CONFLICT`를 받으면 기존 세션을 자동 회수하지 않는다. `SESSION_TOKEN_NOT_REPLAYABLE`은 반환된 sessionId/alias/sid를 보여 주고, 별도 `세션 재발급 확인` dialog에서 `reissueOf`, 미사용 새 sid, 기존 세션 철회 영향을 확인한 뒤 **새 key**로 발급한다. 응답 유실에는 우선 기존 key로 확인한다. 단순 새로고침으로 새 토큰을 계속 발급하지 않는다.

`세션 종료`는 self `DELETE /v1/sessions/:id`로 해당 에이전트 세션까지 철회함을 확인하는 명시 행동이다. 성공 뒤 로컬 CSRF·현재 뷰 모델·구독을 비운다. 브라우저 cookie를 JS가 삭제했다고 가정하지 않는다. 단순 패널 닫기는 세션 철회가 아니다.

### S03·S04: 저장소·이슈 목록

저장소 목록은 owner/slug 링크와 공통 게시판·이슈 목록 진입을 제공한다. `/v1/repos`의 전 페이지를 소비한 뒤만 전체 건수를 쓴다. 빈 저장소·권한 없음·로딩·실패를 다른 상태로 제공한다. bootstrap 저장소 개설은 owner/slug/projectCode/autoBoard/boardOwner를 받고 201 또는 operation 완료 뒤 목록에 반영한다. 202는 `처리 대기 중`이다.

이슈 목록의 열은 번호·제목, STATE, OWNER, 열림/닫힘, COMPACT/BOARD다. OWNER 이름을 아직 못 얻었으면 `담당 이름 확인 중` 또는 ownerAliasId를 텍스트로 보여 주고 임의 이름으로 채우지 않는다. STATE와 isOpen은 서로 다른 축이다. `STATE:done`인데 열린 이슈도 그대로 표시한다.

| 필터/정렬 | UI 의미·기본값 | 현재 가능한 범위 |
| --- | --- | --- |
| 이슈 상태 | open 기본, closed, all; 기존 label `이슈 상태` 유지 | GET R/issues의 `state` 쿼리 |
| 작업 STATE | 전체 또는 enum 한 개 | 선택 open/closed 범위의 모든 페이지 소비 후 client 필터 |
| OWNER | 정확한 담당 별칭 한 개 | Q2 확정 전 전체 결과 필터는 비활성·이유 표시 |
| 참여 별칭 | FROM·TO·CC 참여 기준 후보; OWNER와 별도 | 매칭의 최종 범위/기간은 Q2에서 결정, 미확정 결과 표시 금지 |
| 검색 | 기본 제목·`#번호` 부분 검색, 원문 검색과 구별 | 현재 전체 요약의 제목/번호만 client 검색; 본문/댓글 검색은 제공하지 않음 |
| 정렬 | 번호 내림차순 기본, 번호 오름차순, 제목 오름차순 | 서버는 번호 오름차순 pagination; 전 페이지 후 client 정렬. 갱신시각 정렬은 Q2 전 비활성 |

필터는 AND 결합한다. UI 쿼리 `state`, `workState`, `owner`, `alias`, `q`, `sort`는 공유 가능한 화면 상태이며 지원되지 않는 키를 서버로 전달하지 않는다. `새로고침`은 현재 조건을 보존한다. 페이지 수집 중에는 `목록을 모으는 중 · 조회 N건`을 보여 주고 완전한 0건을 주장하지 않는다. 완료·오류의 긍정 상태가 있어야 한다. 대규모 목록에서 일부만 로딩했다면 `조회된 N건 중` 표시를 유지한다. Q2 결정 없이 일부 페이지에 전역 OWNER/별칭 필터를 적용한 결과를 전체로 부르지 않는다.

### S05: 이슈 상세·댓글 스레드

본문 첫 줄은 `STATE OWNER UPDATED` 순서 및 `REPLY-IN COMPACT BOARD` 선택 키를 `dl/dt/dd`로 표시한다. STATE는 텍스트 상태 배지, OWNER는 별칭 링크, COMPACT는 댓글 앵커, BOARD/REPLY-IN은 이슈 링크다. 없는 키는 가짜 기본값 대신 `없음`으로 표시하며 원문 보기에서 원래 첫 줄을 보존한다. 본문 GOAL/SCOPE/NON-SCOPE/DECISIONS/OPEN-ASK/CLAIM/NEXT/ROSTER 구역은 텍스트로 읽을 수 있어야 한다. HTML은 inert plain text `pre`를 기본으로 유지한다. sanitize를 도입하면 별도 검증 후에도 원문을 제공한다.

댓글은 `ol name=댓글` 안의 `article name=댓글 <id>`다. `id="comment-<id>"`, 기존 `data-comment-id`를 유지한다. 헤더는 FROM·TO·TYPE·CC·RE·STATE·DUE·ACK-BY·SEEN·SUPERSEDES·REPLY-IN 칩을 노출하고, MIRROR-OF·GATE·DESTRUCTIVE도 있으면 숨기지 않는다. 칩의 키는 `dt`, 값은 `dd`; P8의 댓글당 봉투 `dl` 하나를 유지한다. CSS로 줄바꿈 가능한 칩 모양을 만들며 버튼 역할을 붙이지 않는다. 클릭 동작이 있는 **값만** 실제 링크다. `FROM:alias/sid`의 sid도 텍스트로 보여 준다. `time datetime`에 원본 createdAt, DUE/ACK-BY에는 offset 포함 원문과 지역화 보조 표기를 쓴다.

RE·SUPERSEDES의 복수 id는 각각 앵커다. 화면에 이미 있는 댓글이면 `#comment-<id>`로 이동·해당 article에 프로그램 포커스한다. COMPACT 이전/OTHER 접힘 밖 참조라면 단건 `GET R/comments/:id`로 원문을 읽고 `참조 댓글 <id>`의 이름 있는 dialog에서 보여 준다. 기존 토글 상태·snapshot을 바꾸거나 본문 전체를 재수집하지 않는다. 원문으로 본 이슈 번호를 확인할 수 없으면 현재 이슈 URL을 추측하지 않고 단건 보기로 유지한다. 접근 불가/foreign 404는 참조 실패 메시지를 제공하고 초안은 보존한다. SUPERSEDES는 `대체 대상` 링크이며 과거 댓글을 삭제하거나 일방적으로 HOLD 해제를 표시하지 않는다.

기본은 최신 유효 COMPACT **자체와 이후**다. `전체 댓글 보기`(`aria-expanded=false`) → `최신 COMPACT 이후 보기`(`true`) 토글을 유지한다. 서버 snapshot pagination 경계는 끝까지 고정하며, 새 COMPACT 도착은 `새 구간 요약이 있습니다` 상태와 새 snapshot 반영 행동을 제공한다. 현재 초안·포커스·읽던 위치를 보존한다. 새 댓글은 자동 반영하되 사용자가 과거를 읽고 있으면 하단으로 강제 이동하지 않고 새 댓글 수와 이동 링크를 제공한다.

COMPACT는 두꺼운 경계선·`구간 요약` 문구·실제 `h2` 마커 `## ===== COMPACT #<이슈> through <SEEN id> =====`를 함께 쓴다. 마커를 장식문구로 번역하거나 `role=separator`로 h2를 대체하지 않는다. 전후 구간을 색만으로 구별하지 않는다. 요약의 DECISION/OPEN-ASK 원 id로 돌아갈 수 있어야 하며 요약을 새 권위로 다루지 않는다.

`[NOENV]`는 원문을 보여 주되 경고 `[NOENV] 봉투가 없어 실행할 수 없습니다`를 해당 article 안의 alert로 표시한다. 붉은/경고 경계·텍스트를 함께 쓰며 사람이 게시한 native 댓글로 오인시키지 않는다. 실행·ACK 자동작성·HOLD 효력 행동을 제공하지 않고 `봉투 재게시 요청 작성`만 유효 TYPE ASK 초안으로 연결할 수 있다. 서비스 게시에서 NOENV를 만드는 우회 모드는 없다.

우선수신 보기는 서버의 ME→CC→ALL→OTHER를 그대로 쓴다. 기본 연대기 스레드와 `우선 수신순` 보기를 명시 전환한다. 지시를 놓치지 않도록 PENDING-ACK·HOLD·DECISION은 우선 영역에 **링크**로 노출하고 article을 복제하지 않는다. OTHER는 `details/summary`로 봉투만 접어 표시하고 클릭한 때 단건 전문을 읽는다. 타인 HOLD·DECISION은 ALL로 전문 표시하며 `OTHER 접기`·TYPE 필터로 숨기지 않는다. 자기 FROM은 연대기 스레드에서 보존하되 inbox/watch의 자기 FROM 생략 계약을 바꾸지 않는다.

### 댓글 작성기와 빠른 응답

기존 `form name=댓글 작성`, label `댓글 본문`, 버튼 `검사`·`게시`는 유지한다. 기본 raw 본문 편집을 계속 제공하고 `구조화 작성`은 같은 본문의 편집 보조다. 구조화 필드 변경 후 자동 생성될 첫 줄과 본문을 미리 보여 주며, raw 모드에서 작성한 내용을 무손실 round-trip할 수 없으면 확인 없이 덮어쓰지 않는다. 폼이 모든 원문을 재정렬·trim·HTML 변환하지 않는다. 편집한 raw 문자열이 최종 요청 body다.

공통 필드는 FROM(인증 alias/sid 기본·일반 세션 읽기 전용), TO 한 명 또는 ALL, TYPE, CC, RE, DUE, ACK-BY, SEEN, SUPERSEDES, REPLY-IN, MIRROR-OF, GATE, DESTRUCTIVE다. 필수/선택은 아래 표와 기존 정본 parser를 따른다. 미리보기는 escaped 본문·봉투·전송될 metadata·총 codepoint 수를 보여 주되 packet token은 마스킹한다. 모든 사용자 문자열은 resources 키다. TYPE/키 이름·서버 reason·사용자 원문만 원형 보존한다.

| TYPE(13개) | 추가 필수·자동 폼 동작 | 게시 전 안내 |
| --- | --- | --- |
| ASK | TO 1명, ACK-BY; 본문 `ASK @<TO>: <요청 1개>` 정확히 1줄 | 요청 둘이면 댓글 둘, ALL 금지 |
| HOLD | TO 1명, ACK-BY, live SEEN | 즉시 중단 대상; 서버 접수 기준 ACK-BY≤10분; ACK로 해제 안 됨 |
| DECISION | TO 1명, ACK-BY; 개정은 SUPERSEDES | STATE 선택, HOLD 해제는 해당 HOLD id SUPERSEDES |
| HANDOFF | TO 1명, ACK-BY, REPLY-IN | 실제 TO의 ACK·accept 전 이관 대기 |
| ACK | RE | 수용/반론/부분수용과 근거; STATE 선택 |
| PLAN | DUE | 목표·범위·단계·사전 판정·GATE·ROSTER |
| CLAIM | DUE, SEEN | 자원·범위·복구 담당·GATE 증거; 실행 장벽 서버 검사 |
| RELEASE | RE(본인 CLAIM) | 원복 근거·다음 담당 착수 가능 여부 |
| REPORT | STATE | 실행 결과·근거·미검증·NEXT |
| VERIFY | RE, 본문 `VERDICT:PASS` 또는 `VERDICT:FAIL` 또는 `VERDICT:BLOCKED` | 독립 검증 근거 |
| NOTE | 공통 필드 외 추가 없음 | 실행 요청은 별도 ASK |
| ALIAS | TO:ALL | 별칭 등록·개명 공지; registry 변경 자체는 전용 API |
| COMPACT | TO:ALL, SEEN; 이전 요약 있으면 RE; 강한 마커·metadata | S13 도우미로 연결, OWNER 서버 검사 |

STATE 값은 `queued|running|blocked|hold|done|failed|cancelled|pending-user`이며 댓글 STATE는 REPORT(필수)·ACK/DECISION(선택)에서만 쓴다. TO는 하나, CC는 쉼표 목록이며 sid/@/ALL을 CC로 쓰지 않는다. 시각 입력은 날짜+offset을 분리해 가독성을 주되 최종 값은 정본 ISO와 일치시킨다. FROM 별칭 regex는 `^[a-z0-9]{2,6}-(?:\d{1,5}-)?(?:[a-z0-9]{2,12}|[가-힣]{2,8})$`, 전체≤24자다. sid는 정본 문법 `[a-z0-9-]{1,12}`를 따르며 `s1/s2`를 기본 제안한다. TO/CC 레거시 허용 범위를 이 정규식으로 좁히지 않는다. 서버가 최종 판정한다.

`검사`는 인증된 `POST I/preflight`이며 **dry-run** 설명을 붙인다. 아직 이슈가 없는 S09는 `/v1/validate`의 문법 검사만 가능하므로 `문법 검사 · 개설 문맥 미검증`이라고 명시한다. preflight 결과에는 checkedAt·revision·due를 보여 주며 이후 동시 변경이 있으면 성공 표시를 무효화한다. 검사 성공이 게시 확정은 아니다. `게시`는 현재 request를 서버에 재검사·저장하며 preflight 실패를 UI가 생략해 성공으로 만들지 않는다. raw 모드는 기존 시험처럼 잘못된 본문을 실제 서버에 제출해 422를 받을 수 있어야 한다.

422는 `{code,path,message}` 원문 **순서 그대로** `#composer-errors[role=alert]`의 paragraph 목록에 한 번 보여 준다. P8가 검사하는 textarea의 `aria-invalid=true`, `aria-describedby="composer-errors"`를 유지한다. 해당 구조화 필드도 invalid와 연결된 사유를 제공한다. P7 `ClientError.reasons`는 message만 남기므로 `entry/client`의 front 전용 응답 어댑터에서 원 error.reasons의 code/path를 보존한다. 공용 패키지나 서버 변경이 전제는 아니다.

필드 연결은 정확한 `path=envelope.ACK-BY` 등과 `compactPacketToken/sampledIds/compactedBy/compactDeferredReason`을 우선한다. 현재 PROTOCOL 오류는 `path=body`인 경우가 있으므로 정본 필수키 템플릿(예 `지시성 TYPE ASK: ACK-BY 필수`)에 **명확하게 일치하는 경우만** ACK-BY 등에 보조 연결한다. 그 밖에는 본문/폼 전체 사유로 남긴다. RECIPIENT_UNKNOWN의 `path=alias`를 TO라고 추측하지 않는다. 매핑용 문구·힌트도 resources, 서버 message는 번역·교정·중복 합치기하지 않는다. 첫 오류로 이동하는 요약 링크를 제공하며, summary 내부의 원문 paragraph 수·순서는 유지한다.

빠른 응답은 모두 **초안 → 미리보기/검사 → 명시 게시**다. ACK는 원 FROM을 TO, 원 id를 RE, 현재 alias/sid를 FROM으로 채운다. 버튼 `수신 확인 작성`과 dialog `수신 확인 미리보기`, `ACK 게시`를 유지하고 수용/반론/부분수용을 편집 가능하게 한다. HOLD는 대상 실행자 한 명·중단 대상·SEEN·ACK-BY를 받는다. DECISION SUPERSEDES는 원 댓글 id·실제 수신자·ACK-BY·판정 근거를 채운다. HOLD 해제인 경우 권한·활성 HOLD를 재확인한다. 열린 HOLD에 ACK를 썼다는 이유로 해제 완료를 표시하지 않는다.

일반 댓글은 4000 codepoint, COMPACT는 2000, 게시판 NOTE는 1500 상한을 안내한다. codepoint는 UTF-16 `.length`와 구분한다. HTTP 64KiB 상한도 별도다. 실패 시 초안·입력 포커스·key를 필요한 범위에서 보존한다. 알려진 최종 422 수정 후 재게시에는 새 payload용 key, 결과 미확정/연결 장애 재시도에는 같은 key를 쓴다. native form validity로 막힌 경우와 서버 422를 구별한다.

### S06: 받은편지함과 전달 상태

별칭은 현재 principal로 고정하고 repo·issues·board·since-compact를 필터로 둔다. 별칭별 보기를 바꾸려면 S02에서 그 별칭 세션을 연결한다. `me` 필터가 허용돼도 다른 alias의 영수·처리·반영 권한을 얻는 수단으로 사용하지 않는다. 화면 상단에 **PENDING-ACK(window)**·**PENDING-ACK-GLOBAL**·**ACK-STATE waiting**을 별도 표시하고 각각 원 지시 링크를 제공한다. 정렬은 활성 HOLD/긴급 경보 영역 → PENDING-ACK 대상 → ME → CC → ALL → OTHER다. 같은 delivery/article을 두 번 렌더하지 않고 상단 목록은 링크만 둔다. 그룹 내 정렬은 기한 있는 항목 먼저 ACK-BY 오름차순, 나머지 ordinal 순이다. 처리 cursor는 이 표시 순서에서 만들지 않는다.

상태 칩은 `posted`, `delivered`, `acked`, `applied`, `superseded`를 원문으로 표시하고 한국어 설명을 붙인다. posted는 영속 게시, delivered는 전송 영수, acked는 실제 TO의 직접 `TYPE:ACK RE`, applied는 검증된 REPORT/VERIFY 근거를 수반한 반영 보고다. 외부 작업 성공이 자동 검증됐다는 뜻으로 쓰지 않는다. 전송 수신·읽기·미리보기·체크박스 선택으로 ACK나 applied를 만들지 않는다.

| 행동 | 필요한 증거·결과 | 금지되는 추정 |
| --- | --- | --- |
| 영수 확인 | pull/WS/SSE 소비 후 실제 id·attempt의 HTTP receipts(≤100개), subscriptionId는 있으면 포함 | 단순 연결 성공을 영수로 기록하지 않음 |
| 수신 확인 작성 | 원문을 확인한 사람의 명시 ACK 게시; 201/operation 완료 뒤 최신 inbox 조회 | 미리보기 열기만으로 ACK 안 함 |
| 처리 완료 기록 | ACK/답 댓글 id로 inbox/process, 정보성은 ignored+사유 가능 | 미ACK 지시 ignored 금지, 연속 prefix를 UI가 계산하지 않음 |
| 반영 보고 | 직접 TO의 ACK 후 본인 REPORT/VERIFY RE 원 지시 → application(evidenceCommentId,outcome,reason?) | REPORT RE만으로 acked/apply 완료 표시 금지 |
| 미반영 기록 | `outcome=not-applied`·사유, 서버 반환 결과 표시 | 기존 상태를 임의 failed/applied로 바꾸지 않음 |

정보성 NOTE/CLAIM에도 ACK 답변은 허용하며 `ACK 버튼`을 지시 전용으로 제한하지 않는다. 반면 제3자/mention-only/대리 ACK가 실제 TO의 delivery를 acked로 바꾼다고 안내하지 않는다. 같은 별칭의 승계 sid는 직접 ACK 가능하다. `my REPORT RE`로 pendingLegacy만 해소되고 ACK-STATE가 waiting인 예를 도움말과 시험에 넣는다.

ACK-BY offset과 경과 시간을 함께 표시한다. 화면 시계의 경과 표시는 `기한 경과` 예상 표시이며 서버 overdue/escalated 사실·attempt와 구별한다. 서버 사실이 도착하면 최신 aliasEventSequence로 갱신한다. 첫 기한 경과·+30초/+120초 재전달·HOLD 첫 overdue 즉시 escalation·일반 attempt3 후 escalation·15분 digest는 서버 계약 안내다. UI는 재전달 댓글을 새로 만들거나 무응답을 동의로 변경하지 않는다. PENDING-ACK-GLOBAL 해소와 재알림 중단도 서버 결과를 따른다.

### S07·S08: 공통 게시판·ROSTER·별칭 registry

공통 게시판은 `GET R/board`의 number/state/via/evidence를 보여 주고 S05의 본문·스레드 컴포넌트를 재사용한다. 별도 복제 게시판 데이터 모델을 만들지 않는다. NOTE/ACK/ALIAS/COMPACT만 선택할 수 있고 작업 조율·HOLD·CLAIM·DECISION은 주제 이슈로 안내한다. NOTE는 1500자 상한, 결과 1줄·실패/교훈≤3줄·재사용 산출물·원 이슈 REPORT id·REPLY-IN을 템플릿으로 제공한다. 열린 board 없음404, 충돌/닫힘409를 구별한다. registry와 다른 임의 이슈를 조용히 게시판으로 채택하지 않는다. 생성은 bootstrap `board/ensure`, 닫힌 board는 같은 board 재개 절차로 안내한다.

ROSTER 표 열은 `alias | role | model | scope | sid`다. 이슈 본문 원문에서 추출한 행은 `이슈 본문 ROSTER · revision N` 출처를 표시하며 등록 registry와 구분한다. alias/sid 승계와 CLAIM 자원 승계를 분리한다. 미RELEASE CLAIM에는 원 CLAIM id·자원·담당·DUE, RELEASE 링크를 보여 주고 DUE 경과를 자원 해제로 해석하지 않는다. 동시 CLAIM은 서버 사실과 더 작은 comment id 우선 규약을 표시하며 UI 잠금 획득 성공으로 부르지 않는다.

별칭 충돌 검사 폼은 owner·name·deep을 받으며 available/collisions의 kind/alias/evidence를 보여 준다. 충돌 없음은 등록 예약이나 session 발급 성공이 아니다. `exact`, case-only, substring, edit-distance-1 등 서버 kind를 손실 없이 표시한다. 등록은 bootstrap의 role/model/scope/repos·ALIAS 공지 원문을 전용 API로 제출한다. 개명은 허용된 본인/OWNER 등 서버 권한을 따르며 newName과 공지·기존 이름 tombstone을 안내한다. 과거 댓글 FROM을 새 이름으로 소급 편집하지 않는다. Q1 전에는 완전한 registry 표·선택지를 제공했다고 표시하지 않고, 현재 ROSTER·현재 principal·방금 검사/등록 응답만 각 출처로 표시한다.

### S09~S12: 개설·본문 편집·닫기·이관

S09/S10은 구조화 첫 줄 + 원문 본문을 함께 제공한다. 첫 줄은 `STATE:<enum> OWNER:<alias> UPDATED:<iso> [REPLY-IN:#n] [COMPACT:<id>] [BOARD:#n]`, 앞 3키 순서 고정이다. 등록 OWNER/포인터·날짜·본문을 validate/preflight로 검사한다. S10은 현재 revision/ETag·변경 전후 원문을 보여 주고 `PATCH I/body`에 If-Match를 보낸다. 412는 최신 본문·사용자 초안을 나란히 보여 주고 사용자가 다시 병합·검사하게 한다. 자동 overwrite, 428 무시, 성공 전 revision 선행 갱신은 금지다.

| 필드 | S09 개설 | S10 본문 편집 | 관리 행동 |
| --- | --- | --- | --- |
| 제목 | editable | readonly(본문 PATCH에 전송 안 함) | 제목 수정 API 미제공 |
| STATE·UPDATED·GOAL/SCOPE/NON-SCOPE·일반 본문 | editable | editable | 서버 문법·권한 검사 |
| OWNER | editable(등록 별칭) | readonly | 변경은 S12 HANDOFF |
| COMPACT·REPLY-IN | 미제공(초기 본문에 생성 안 함) | readonly(기존 값 유지) | COMPACT/HANDOFF 전용 관리 |
| BOARD | editable(접근 가능한 게시판 참조) | editable | 서버 참조 검사 |
| revision·ETag | 미제공 | readonly | If-Match에 현재 revision 전달 |

raw 모드는 그대로 제공한다. raw의 OWNER 변경·포인터 변경을 조용히 되돌리지 않고 서버 `HANDOFF_REQUIRED`·`POINTER_MANAGED` 등 원문 오류를 노출한다.

S11은 P8 dialog·label·버튼 이름을 유지한다. terminal body STATE, 최종 REPORT done/failed/cancelled, 최종 REPORT·HANDOFF 완료를 포함한 새 COMPACT, 미답 ASK/ACK-STATE waiting·active HOLD·미RELEASE CLAIM·pending HANDOFF 0을 체크리스트로 보여 준다. 이 체크는 서버 진단 안내이며 close endpoint가 최종 판정한다. CLOSE_BLOCKED는 원 blocker id와 상세를 dialog alert로 표시하고 각 항목으로 이동한다. before-close due 기록은 닫기 실패에도 남을 수 있음을 보여 준다. 성공 후 `이슈가 닫혔습니다`, 닫힘 배지·후속 REPLY-IN 링크를 표시한다. closed 이슈에는 일반 작성기를 비활성하고 서버가 허용한 OWNER 후속 라우팅 행동만 안내한다. 재개는 별도 사유·STATE 확인 후 기존 reopen API를 사용한다.

S12의 입력은 TO 한 명·ACK-BY·REPLY-IN 후속 이슈·결과/근거·남은 질문·자원/승인 경계다. 전송 원문에 `지금부터 이 이슈에 쓰지 마라`를 포함하는 정본 handoff 예시를 사용하고 COMPACT 필요 여부를 먼저 확인한다. 게시 후는 `수신 ACK 대기`다. 실제 TO가 쓴 유효 ACK id로 accept, OWNER가 최신 expectedRevision으로 complete하며 각각 서버 확인 뒤만 단계가 전진한다. HANDOFF ACK가 있다는 것과 accept·complete 완료는 다른 상태다. 완료 전 기존 책임 해제·OWNER 변경·close를 성공으로 표시하지 않는다. 타 저장소 REPLY-IN도 접근 확인하고 닫힌 대상은 이유를 표시한다.

### S13: COMPACT 도우미

status는 previousCompactId/count/chars/due/reasons/owner를 보여 준다. 일반 이슈 **≥25댓글 또는 ≥40,000자**, board **≥30댓글 또는 ≥40,000자**, 그리고 DECISION/HANDOFF/닫기 직전의 due를 구별한다. 현재 줄 수·브라우저에 로드된 댓글 수를 정본 통계로 쓰지 않는다.

순서는 purpose 선택 → prepare → 패킷 검토/다운로드 → 요약 입력·표본 원문 대조 → 검사 → 게시다. prepare의 purpose는 routine/before-decision/before-handoff/before-close다. `GET packet`은 기존 snapshot을 다운로드하는 읽기이고 새 구간 준비가 아니다. 204는 `요약할 새 구간이 없습니다`로 표시한다. markdown은 UTF-8 LF, 기본 파일명 `compact_packet_<owner>_<repo>_<issue>_<through>.md`다. packetToken/hash/through/revision은 메모리의 해당 패킷과 묶고 raw token은 화면·로그·다운로드 markdown에 넣지 않는다. maskedCount를 보여 주며 UI가 마스킹을 되돌리지 않는다.

요약은 사람이 쓰거나 별도 위임 산출물을 붙여 넣는다. UI가 자동 요약·위임 실행을 시작하지 않는다. 원 id 표본≥3개(구간1~2건이면 전부, control-only0이면 빈 배열) 확인과 `sampledIds`를 기록하고, `compactedBy` 등록 별칭을 입력한다. 이전 COMPACT 있으면 RE에 포함, TO:ALL, SEEN/through/실제 이슈 일치, 줄2의 강한 마커와 footer를 검사한다. 마지막 줄은 `compacted-by:<compactedBy>`로 시작하며 괄호 등 접미사를 허용하되 별칭 문자 `[a-z0-9가-힣-]`가 바로 이어지면 다른 별칭으로 판정하는 v2.3 계약을 유지한다.

게시 요청은 `{body,compactPacketToken,sampledIds,compactedBy}`만의 top-level 키다. unknown key·metadata wrapper를 만들지 않는다. 409 COMPACT_STALE/410 COMPACT_PACKET_EXPIRED에는 새 구간 준비가 필요하다고 표시하고 초안과 이전 표본 대조 기록을 보존한다. 새 prepare는 새 key, 이전 prepare의 단순 재시도는 같은 key다. 원문을 몰래 trim/마커 교체해 오류를 피하지 않는다. 성공은 댓글 id·새 본문 revision·COMPACT 포인터 재조회로 확인한다.

DECISION/HANDOFF 긴급 게시에서 서버가 인정하는 요약 생략이 필요하면 `compactDeferredReason`(공백 아닌1–500 codepoint)을 별도 입력하고 전송될 metadata를 미리 보여 준다. 이 UI는 요약 의무를 자동 면제하지 않는다. close는 별도 최종 COMPACT 조건을 따른다. packet의 pendingAppendix/controlFactsSinceCompact 및 창 밖 미해결 의무도 표시하고, 단순 since-compact 토글로 열린 지시/HOLD/CLAIM을 없애지 않는다.

## 4. 테마 토큰

기본 document root는 `data-theme="dark"`다. 아래 CSS는 styles/index.css의 구현 정본이다. shadow는 전부 none, radius 기본8px다. 시스템 글꼴은 Segoe UI/Inter/system-ui, 코드는 ui-monospace다. 외부 폰트 다운로드를 요구하지 않는다.

```css
:root,
:root[data-theme="dark"] {
  color-scheme: dark;
  --ui-bg: #1a1a1a;
  --ui-sidebar: #161616;
  --ui-panel: #262626;
  --ui-border: #333333;
  --ui-input: #202020;
  --ui-text: #e8e8e8;
  --ui-muted: #9a9a9a;
  --ui-accent: #d97757;
  --ui-link: #6ea8fe;
  --ui-success: #3fb950;
  --ui-warning: #e3b341;
  --ui-danger: #f85149;
  --ui-code-text: #ff7b83;
  --ui-code-bg: #2a2a2a;
  --ui-on-accent: #161616;
  --ui-focus: #6ea8fe;
  --ui-radius: 8px;
  --ui-shadow: none;
  --ui-font: "Segoe UI", Inter, system-ui, sans-serif;
  --ui-font-code: ui-monospace, SFMono-Regular, Consolas, monospace;
  --ui-font-size: 14px;
  --ui-line-height: 1.5;
  --ui-space-1: 4px;
  --ui-space-2: 8px;
  --ui-space-3: 12px;
  --ui-space-4: 16px;
  --ui-space-6: 24px;
  --ui-control-height: 32px;
  --ui-sidebar-width: 232px;
  --ui-context-width: 288px;
}
/* :root[data-theme="light"]는 후속 토큰 슬롯. P9에서 light 선택기를 노출하지 않는다. */
```

본문은 --ui-text, 부가 정보는 --ui-muted, 클릭 링크는 --ui-link다. 주 행동 배경은 --ui-accent와 --ui-on-accent, 보조 행동은 panel/input 표면을 쓴다. 상태는 텍스트+아이콘/경계로 구분하고 단순 녹색/빨강만 쓰지 않는다. 입력 경계는 --ui-border, focus-visible은 --ui-focus 2px 이상+offset2px다. disabled는 opacity만으로 내용을 읽을 수 없게 만들지 말고 disabled 속성·비활성 이유를 병기한다.

inline code는 --ui-code-text 위 --ui-code-bg와8px 둥근 모서리, 좌우4px 패딩이다. 정확한 지정 색을 유지하며 작은 글자 대비는 배포 screenshot/접근성 점검에서 따로 검증한다. 빨강 코드색을 오류 유일 신호로 쓰지 않고 필수 상태/동작 이름은 --ui-text의 별도 label로 읽을 수 있어야 한다. 긴 pre는 줄바꿈을 기본으로 하고 원문 복사 시 원래 bytes를 유지한다. hover는 border/밑줄, 선택은 accent 경계·배경과 `aria-current/selected`로 표현한다. 별도 그림자·그라디언트·라이트 폴백 테마를 추가하지 않는다.

## 5. 컴포넌트와 semantic 계약

모든 UI 카피·aria-label·title·placeholder·상태 메시지·동적 formatter는 `resources` 키다. 아래의 한국어는 고정 accessible name 값이며 구현에서 inline 문자열을 쓰라는 뜻이 아니다. 권장 namespace는 `ko.session.*`, `ko.navigation.*`, `ko.issue.*`, `ko.comment.*`, `ko.composer.*`, `ko.inbox.*`, `ko.board.*`, `ko.roster.*`, `ko.compact.*`, `ko.feedback.*`다. 기존 P8 `ko` 공개 키/formatter와 deliveryLabels는 호환 export로 유지한다. literal 봉투키·enum·서버 reason·사용자 데이터는 i18n 번역 대상이 아니다.

`—`는 testid를 만들 필요가 없다는 뜻이다. role/label로 유일하게 찾을 수 없는 반복 구조와 비사용자 식별 앵커에만 testid를 둔다. 추가 testid는 아래 표만 승인하고 단순 스타일 클래스명을 locator로 쓰지 않는다. 각 row/article scope 안에서 버튼 이름을 찾는다.

| ID / 컴포넌트 | native 요소·role / accessible name | data-testid·식별 속성 | 상태·행동 계약 |
| --- | --- | --- | --- |
| C01 AppShell | header/main, h1 1개 | — | skip link `본문으로 이동`, page main 1개 |
| C02 SidebarNavigation | nav `주 탐색` | — | 실제 a, aria-current; 기존 nav 이름 유지 |
| C03 RepoSwitcher | label+select `현재 저장소` | — | 미선택 안내·허용 repo만 |
| C04 SessionBanner | section `현재 세션` | — | alias/sid/만료 텍스트 |
| C05 ConnectionForm | form `세션 연결`, password `세션 토큰` | — | button `연결`, busy·401 |
| C06 SessionIssueForm | form `세션 발급` | — | label `별칭`·`세션 ID`·`관리 토큰`; token 마스킹 |
| C07 RepoList | ul `저장소` | — | li 안 owner/slug 링크 |
| C08 IssueFilters | form `이슈 필터` | — | labels `이슈 상태`·`작업 STATE`·`담당 별칭`·`참여 별칭`·`이슈 검색`·`정렬` |
| C09 IssueTable | table `이슈 목록` | — | th scope col/row, 완전성 status |
| C10 IssueRow | tr(row), primary link `#<n> <title>` | `issue-row`, data-issue-number | 기존 계약 유지·행 안 scope |
| C11 IssueSummary | section(region) `이슈 현재 상태` | — | 봉투 dl1개·open/closed |
| C12 EnvelopeList | dl, dt(term), dd(definition) | — | 키·값 모두 보이는 텍스트 |
| C13 EnvelopeChip | dl의 div/dt/dd | `envelope-chip`, data-envelope-key | 반복 field scope, 비대화형 칩 |
| C14 ReferenceLink | a `참조 댓글 <id>` / `대체 대상 <id>` | — | href+단건 원문 dialog |
| C15 CommentThread | ol `댓글` | — | li마다 article 하나 |
| C16 CommentArticle | article `댓글 <id>` | `comment`, data-comment-id, id=comment-<id> | createdAt time·프로그램 포커스 tabindex=-1 |
| C17 RawBodyDisclosure | details/summary role=button `원문 보기` | — | 원문 escaped pre·P8 s2의 명시 role 유지 |
| C18 NoEnvWarning | p role=alert | — | `[NOENV] 봉투가 없어 실행할 수 없습니다` |
| C19 CompactMarker | h2 실제 강한 마커 | `compact-marker` | role 재지정 없음·구간 요약 문구 |
| C20 HistoryToggle | button `전체 댓글 보기` / `최신 COMPACT 이후 보기` | — | aria-expanded·controls=issue-comments |
| C21 PriorityGroup | section `ME` / `CC` / `ALL` / `OTHER` | — | heading·그룹별 count, 중복 article 금지 |
| C22 OtherDisclosure | details/summary `OTHER 댓글 <id> 전문 보기` | — | 기본 봉투만, 명시 열기 뒤 원문 |
| C23 Composer | form `댓글 작성`, textarea `댓글 본문` | — | `검사`·`게시`, busy·기존 ID 관계 |
| C24 EnvelopeFields | fieldset+legend `봉투 필드` | — | label=정본 KEY, required·readonly |
| C25 TypeSelect | label+select `댓글 TYPE` | — | TYPE13만·필수 폼 갱신 |
| C26 Preview | section `댓글 미리보기` | — | plain text·자수·metadata 마스킹 |
| C27 ValidationSummary | div role=alert id=composer-errors | — | ordered paragraph 원문, field 이동 링크는 별도 |
| C28 FieldError | p, 입력 aria-describedby 대상 | — | label된 필드와 연결, 오류 순서 보존 |
| C29 QuickReplyActions | group `빠른 응답` | — | `수신 확인 작성`·`HOLD 작성`·`DECISION 작성` |
| C30 InboxScope | form `받은편지함` | — | 기존 repo/issues labels·`조회`·`새로고침` |
| C31 InboxRegion | section `받은편지함` | — | pending window/global/ackState 분리 |
| C32 DeliveryCard | article `전달 <deliveryId 또는 viewKey>` | `delivery`, data-delivery-id(실제 있을 때) | 순수 canonical에는 fake id 없음 |
| C33 DeliveryStatus | dl 또는 p·time | `delivery-state`, data-state | 상태 enum·attempt·ACK-BY; repeated scope |
| C34 AckPreview | dialog `수신 확인 미리보기` | — | `ACK 게시`·`취소`, 열기만으로 게시 안 함 |
| C35 IgnoreDialog | dialog/form `무시 사유 확인` | — | textarea `무시 사유`, 지시 비활성 이유 |
| C36 ApplicationForm | form `반영 근거 기록` | — | `근거 댓글 ID`·`반영 결과`·`미반영 사유`, ACK_REQUIRED |
| C37 IssueContextAside | aside `이슈 보조 정보` | — | 상태·OPEN-ASK·HOLD·CLAIM 링크 |
| C38 RosterRegistry | table `ROSTER` / `별칭 레지스트리` | `alias-row`, data-alias | 출처·미확인·tombstone 텍스트 |
| C39 AliasCheckForm | form `별칭 충돌 검사` | — | `별칭 검사`·결과 list, available≠예약 |
| C40 BoardView | section `공통 게시판` | — | 현재 page h1 외 중복 main 없음 |
| C41 IssueForm | form `이슈 개설` / `본문 편집` | — | title/body/STATE/OWNER·문법검사/문맥검사 구분 |
| C42 CloseDialog | dialog `이슈 닫기 확인` | — | `최종 REPORT id`·`닫기 사유`·`닫기 실행`·`취소` |
| C43 HandoffDialog | dialog `이관` | — | 단계별 form `이관 작성`/`이관 수용`/`이관 완료` |
| C44 CompactAssistant | section `COMPACT 도우미` | — | `패킷 준비`·`패킷 다운로드`·`COMPACT 게시` |
| C45 AsyncState | p role=status·alert, loading aria-busy | — | 로딩·빈 상태·실패·성공 모두 긍정 신호 |
| C46 StreamStatus | status 또는 alert, name=`실시간 연결` | — | 하나만 존재·연결됨/대기/오류 |
| C47 OperationStatus | section `요청 처리 상태`, 내부 status | — | operationId·대기/최종결과, 중복 게시 금지 |
| C48 ConfirmSessionReissue | dialog `세션 재발급 확인` | — | 기존 철회 영향·새 sid·`재발급 실행` |

동일 페이지에서 같은 이름의 form과 region은 role이 다르므로 구분 가능하다. `새로고침`은 활성 페이지의 필터 form 하나에만 두고 보조 패널에 같은 이름을 중복 추가하지 않는다. 같은 페이지에 dialog 여러 개가 있어도 열리는 것은 하나, 닫힌 dialog는 접근성 트리에서 제외한다. alert가 loading처럼 항상 보이는 장식이 되지 않도록 실제 실패/긴급 상태에서만 사용한다.

## 6. 키보드·빈 상태·오류

Tab 순서는 skip link → 저장소 선택 → 주 탐색 → 세션 메뉴 → main 필터/목록 링크 → 본문 토글/댓글 참조/빠른 응답 → 작성기 TYPE/필드/본문/검사/게시 → 보조 정보다. CSS의 시각 순서와 DOM 읽기 순서를 맞춘다. 반복 댓글의 본문은 Tab 정지점으로 만들지 않고 링크·summary·버튼만 순서에 넣는다. 구조화 필드에서 필수 설명은 label/legend와 aria-describedby로 읽힌다.

native dialog는 열 때 제목 또는 첫 안전 입력에 focus, modal 내부 Tab 순환, Esc는 닫기·초안 보존, 닫힌 뒤 트리거로 focus 복귀다. 작업 요청 중 Esc로 창을 닫아도 이미 제출한 operation을 취소했다고 표시하지 않는다. 재진입하면 기존 요청 상태를 복구한다. input/textarea/select의 기본 키 동작을 가로채지 않는다. 전역 단축키는 **Esc만** 기본으로 두고 Ctrl+Enter 게시나 한 글자 단축키를 추가하지 않는다. 모든 행동은 버튼으로 가능하다.

| 상태 | 표시·semantic | 복구·수용 기준 |
| --- | --- | --- |
| 최초 로딩 | `불러오는 중`, status aria-busy=true | 기존 B-03대로 목록 table은 준비 전 없음, 완료 후 table/빈 상태가 긍정 신호 |
| 백그라운드 갱신 | 기존 내용 유지+`갱신 중` status | 초안·포커스 보존, 최초 loading으로 화면 전체 교체 안 함 |
| 빈 목록 | `표시할 항목이 없습니다` status | 필터 해제·새로고침, 접근 불가와 구분 |
| 비인증/만료 | `세션 토큰을 연결해 주세요`+S01 | 쓰기·스트림 중지, secret 없는 초안은 메모리 보존 |
| 403 | 권한 부족 code와 해당 행동 이유 | 권한을 UI에서 자동 확대하지 않음 |
| 404 | 해당 repo/issue/reference 없음 | 안전한 목록 링크, 외부 id 세부정보 유출 없음 |
| 409/410 cursor | scope 불일치/만료 안내 | 해당 scope snapshot+global pending 재조회, processed 추정 금지 |
| 409 상태 충돌 | ACTIVE_HOLD/PENDING_ACK/CLOSE_BLOCKED 등 code·원 id | 원문/ACK/RELEASE·COMPACT 행동으로 연결, 장벽 우회 안 함 |
| 412/428 | revision 충돌·If-Match 필요 alert | 최신 원문과 초안 비교·재검사 |
| 422 | ordered 원문 사유+필드 invalid | 초안 유지·정정 후 새 제출, UI가 서버 문구 재작성 안 함 |
| 413 | 요청 크기 상한 alert | 자수·byte 진단, 일부를 몰래 잘라 게시하지 않음 |
| 202/timeout | operationId·`처리 대기 중` status | 기존 key/statusUrl 조회, 성공/실패 확정 전 새 게시 방지 |
| 연결 오류/503 | alert+다시 시도 | 마지막 성공 데이터·시각 표시, 현재 데이터라고 오인 금지 |
| WS 재연결 | `실시간 재연결 대기 중` status | 최초+4회 실패 뒤 `실시간 연결 오류` alert, 거짓 연결됨 없음 |

## 7. 실시간 갱신과 커서

P8의 `browserSocket`과 P7 `subscribe`·`InboxModel`을 유지한다. 브라우저는 동일 origin HttpOnly cookie로 `/ws`를 열고 `issus.v1`을 협상한다. URL 토큰이나 별칭 채널 firehose를 만들지 않는다. 일반 웹은 POST subscriptions → 명시 subscribe 프레임 흐름이다. Monitor 고정 URL 자동 별칭 구독은 v2.3 계약으로 서버가 지원하지만 웹이 bootstrap 권한이나 별도 bearer 저장을 얻는 근거는 아니다.

인증 별칭+session 기본 채널, 선택 repo 및 현재 issue/board 채널을 사용한다. 상세는 `issue:<repoId>:<n>`, repo 목록 관찰은 허용된 `repo:<repoId>:all`을 요청한다. 채널≤32, 각≤128자라서 화면에 표시한 모든 이슈를 무한 구독하지 않는다. 구독 생성의 bootstrap/items/compact와 HTTP snapshot을 viewKey로 합치고, ready만으로 connected를 표시하지 않는다. subscribed 이후에만 `실시간 연결됨`이다.

이벤트는 무효화 신호로도 사용한다. comment/issue body/closed/compact → 해당 상세와 현재 목록 재조회, delivery 상태/attempt/escalation → inbox refresh, alias/board/repo 변화 → 해당 목록/현재 principal 재조회다. 150ms 동안 같은 화면 무효화는 합치되 지시 프레임/receipt를 버리지 않는다. 신규 이슈 opened가 repo all에 모두 방송된다고 가정하지 않는다. 현재 구현은 issue 채널 fact이므로 **목록 신규 발견은 5초 pull 및 창 focus 복귀 재조회**로 보완한다. repo/issue 전체 변경의 순수 push 보장은 미검증이며 API 변경을 요구하지 않는 현 계약 내 갱신 방식으로 명시한다. 숨긴 탭에서 polling을 늦출 수 있으나 복귀 즉시 전체 scope를 새로 확인한다.

WS 1001/1013·일시 오류는 P7의 bounded 재연결(기본250ms 지수 증가·최대10초, UI는 maxReconnects4)을 쓴다. 끊긴 subscriptionId는 새로 개설하고 같은 principal·정렬 scope의 **영수 확정 transport cursor**만 승계한다. 1008/401/403은 무한 재시도하지 않고 재인증/권한 오류로 끝낸다. `eventId` dedupe·stream 내부 sequence 정렬·deliveryId+attempt 및 aliasEventSequence 병합은 P7 모델에 맡긴다. 다른 stream의 sequence를 비교하지 않는다.

SSE는 동일 bootstrap/권한/커서의 대체 transport다. `GET /v1/stream?subscription=...&cursor=...`, `event:frame`·`id:cursor`·15초 heartbeat를 소비하고 HTTP receipts를 쓴다. fetch SSE를 쓰면 cookie/CSRF wrapper와 P7 parser를 재사용한다. 현재 P8의 기본은 WS이며, **WS 오류에서 자동 SSE 성공으로 바꿔 기존 B-03 오류 시험을 무효화하지 않는다**. SSE는 명시 선택 또는 별도 검증한 설정일 때 사용하고 활성 transport를 보여 준다. 둘 다 실패해도 pull로 inbox/상태를 읽을 수 있으며 `실시간 연결 오류`를 숨기지 않는다.

| 커서 | 갱신 조건 | UI 금지 |
| --- | --- | --- |
| pagination/nextCursor | 한 frozen snapshot의 다음 페이지 | 정렬된 마지막 화면 행을 cursor로 쓰지 않음 |
| refreshCursor(H/A/E) | 전체 페이지 소비 완료 뒤 교체 | 이전 snapshot의 늦은 응답으로 새 E/state 후퇴 금지 |
| transport cursor | 프레임 수신·영수 확정 계약 | processed와 교환·미수신 프레임 선진 금지 |
| processedCursor | inbox/process의 서버 확인 연속 ordinal prefix | 조회·수신·peek·컴포넌트 mount만으로 전진 금지 |

순수 canonical history에는 delivery id를 만들지 않는다. 실제 delivery가 있는 항목만 영수·처리할 수 있다. 같은 댓글의 history/inbox는 `comment:<commentId>`, comment 없는 알림은 `fact:<sourceEventId>`로 합쳐1행이다. refresh는 같은 commentId/ordinal이어도 aliasEventSequence(E)의 상태 변화를 반영한다. 단절/늦은 route/중복 프레임 뒤 행0중복·상태 후퇴0·누락0을 수용 기준으로 둔다. 페이지 이탈·repo/alias 전환은 AbortSignal로 이전 조회를 폐기하고 자기 구독만 닫는다.

## 8. API 매핑과 ASK 필요 항목

`R=/v1/repos/:owner/:repo`, `I=R/issues/:number`. owner/repo/id는 path component별 encode한다. 일반 쓰기는 UUID Idempotency-Key, cookie mutation은 동일 Origin+X-CSRF-Token, `Prefer:wait=5`·202 operation polling을 기존 client로 처리한다. validate·aliases/check·preflight는 무변경 검사이며 key/operation이 없다. GET은 게시/ACK/process로 바뀌지 않는다. 조회 성공으로 권한을 추측하지 않고 모든 쓰기의 서버 403/409/422를 처리한다.

| 화면 동작 | 실제 라우트 / 프레임 | 요청·성공 / UI 판정 |
| --- | --- | --- |
| 로그인·현재 세션 | POST `/v1/auth/browser-session`, GET `/v1/auth/me` | session bearer 교환·csrfToken·principal 확인 |
| 발급·명시 재발급 | POST `/v1/sessions` | bootstrap, alias/sid/resumeFrom?/reissueOf?, 최초201 token; replay409 예외 |
| 세션 종료 | DELETE `/v1/sessions/:id` | bootstrap/self,200 revoked |
| 저장소 목록·선택 | GET `/v1/repos`, GET R | items/nextCursor·repo id, 권한 scope |
| 저장소 생성 | POST `/v1/repos` | bootstrap owner/slug/projectCode/autoBoard/boardOwner,201/202 |
| 이슈 목록 open/closed | GET `R/issues?state=open\|closed\|all&cursor=...&limit=...` | 번호 오름차순 요약, 전 페이지 후 지원 client 조건 |
| STATE·제목/번호 검색·번호/제목 정렬 | 위 GET R/issues | 클라이언트 전 페이지 계산, 새 API 없음 |
| OWNER·참여 별칭·서버 검색/정렬 | GET `R/issues?state&owner&alias&q&sort&order` | DECISION6314143095·core REPORT6314466185; apps/issus/docs/api.md Q2 정본 |
| 상세·보조 진단 | GET I | issue/body/envelope/revision/stats/pendingLegacy/ackState/activeHolds/claims, ETag |
| 댓글 since-compact·전체 | GET `I/comments?sinceCompact=true\|false&cursor=...` | compact/items/snapshot/nextCursor, 기본 true |
| RE/SUPERSEDES·OTHER 단건 | GET `R/comments/:id` | 원문/envelope/metadata/createdAt/validity, foreign404 |
| 문법 검사 | POST `/v1/validate` | `{mode,body}`,200 valid 또는422; 개설 문맥 보장 없음 |
| 댓글 dry-run | POST `I/preflight` | `{mode:"comment",request:{body,...허용metadata}}`,200 posted:false 또는 실제 validator 오류 |
| 본문 dry-run | POST `I/preflight` + If-Match | `{mode:"issue-body",request:{body}}`,200/412/422/428 |
| 일반/ACK/HOLD/DECISION 게시 | POST `I/comments` | `{body,compactDeferredReason?}`,201 commentId 또는202; unknown key422 |
| 이슈 개설 | POST `R/issues` | `{title,body}`,201 number/revision 또는202 |
| 본문 편집 | PATCH `I/body` + If-Match | `{body}`,200/202;412 stale |
| inbox 읽기 | GET `/v1/inbox` | repo/issues/반복board/me/mine/sinceCompact/cursor/limit, H/A/E/각 pending·진단 |
| 수신 영수 | POST `/v1/deliveries/receipts` 또는 WS `receipt` | deliveryIds≤100+동일길이 attempts+subscriptionId?,200/202; ACK 댓글과 별개 |
| 읽기 처리 | POST `/v1/inbox/process` | deliveryIds/disposition/evidenceCommentId 또는 reason,200 processedCursor 또는202 |
| 반영 근거 | POST `/v1/deliveries/:id/application` | evidenceCommentId/outcome/reason?,200/202; ACK_REQUIRED409/근거422 |
| 실시간 개설·해제 | POST `/v1/subscriptions`, DELETE `/v1/subscriptions/:id` | channels/from/repo/issues,201 bootstrap·cursor; 닫기200 |
| WS 자동 갱신 | `/ws`; subscribe/receipt → ready/subscribed/event/replay/error | cookie 또는 정본 subprotocol, 서버 event mutation1008 |
| SSE 자동 갱신 | GET `/v1/stream?subscription=...&cursor=...` | event:frame/id/data, Last-Event-ID; 영수는HTTP |
| 게시판 발견 | GET `R/board?issue=n&userBoard=n` | number/state/via/evidence,404/409 |
| 게시판 개설·복구 | POST `R/board/ensure`, POST `I/reopen` | bootstrap ensure; 닫힌 동일 board 재개는reason/state+If-Match |
| ROSTER 읽기 | GET I의 body·revision | 본문 행의 출처 표시, registry 대체 아님 |
| 별칭 registry 목록·상세·선택지 | GET `/v1/owners/:owner/aliases`, GET `.../aliases/:name` | DECISION6314143095·core REPORT6314466185; apps/issus/docs/api.md Q1 정본 |
| 별칭 충돌 검사 | POST `/v1/owners/:owner/aliases/check` | name/deep?, available/collisions, 등록·예약 아님 |
| 별칭 등록·개명 | POST `/v1/owners/:owner/aliases`, POST `/v1/aliases/:id/rename` | role/model/scope/repos/announcementIssue?/announcementBody 또는newName;201/200/202·409 |
| HANDOFF 작성 | POST `I/comments` | TYPE HANDOFF·REPLY-IN·ACK-BY·compactDeferredReason? |
| HANDOFF 수용·완료 | POST `I/handoffs/:commentId/accept`, POST `.../complete` | `{ackCommentId}` / `{expectedRevision}`,200/202; 이 경로 revision은 JSON key |
| 닫기·재개 | POST `I/close`, POST `I/reopen` + If-Match | reason/finalReportId 또는 reason/state,200/202·CLOSE_BLOCKED409 |
| compact due | GET `I/compact/status`, `issus.compact.due` | count/chars/due/reasons/owner |
| 패킷 준비 | POST `I/compact/prepare` | purpose4종,201 packet/204 empty, key 필수 |
| 패킷 다운로드 | GET `I/compact/packet?format=json\|markdown` |200 packet·token/hash,204; no-store |
| COMPACT 게시 | POST `I/comments` | body/compactPacketToken/sampledIds/compactedBy,201/202·stale409·expired410 |
| 202 결과 확인 | GET `/v1/operations/:id` | 본인actor,200 status/posted/httpStatus/response/error; domain 실패를 성공으로 표시 금지 |

JSON metadata는 body와 같은 top level이고 `metadata:{...}` wrapper는 없다. `POST I/preflight`는 operation을 만들지 않는다. session 발급 토큰 응답만 일반 원응답 replay 예외이며 재시도 정책을 일반 댓글과 섞지 않는다.

### API 공백 레지스트리: 2건

| ID | ASK / 영향 | 확정 전 명세 처리 | 확정 주체·완료 조건 |
| --- | --- | --- | --- |
| Q1 | [ASK 6313840976](https://github.com/hikaMaeng/issus/issues/1#issuecomment-6313840976): owner 별칭 registry 읽기 없음. S02 후보·S08 완전한 registry 영향 | 현재 principal/ROSTER/개별 check·등록 결과만 출처별 표시, 완전 목록 주장 금지 | orch DECISION → 계약·P4 소유 구현·VERIFY 후 화면 연동. 새 경로/응답을 이 문서가 선결정하지 않음 |
| Q2 | [ASK 6313841431](https://github.com/hikaMaeng/issus/issues/1#issuecomment-6313841431): 이슈 OWNER/참여 별칭 필터·확장 검색/정렬 조회 계약 없음 | 기존 state·client STATE/제목·번호·정렬은 동작, 지원 외 필터는 비활성 이유. 전체 댓글 스캔으로 우회하지 않음 | orch DECISION에 참여 의미·기간·검색 범위·정렬·완전성 확정 → 실제 라우트 매핑/시험 보완 |

두 ASK가 미응답이면 이 명세는 현재 API 경계와 목표를 기록한 상태로 VERIFY에 넘긴다. Q1/Q2 영역은 제품 기능 완료·전체 UI 수용 PASS로 계산하지 않는다. 추가 API가 필요하다고 서버 경계를 몰래 넓히지 않는다.

v1.1 구현 중 DECISION6314143095와 core REPORT6314466185로 두 공백의 계약·구현 인계를 확인했다. U1은 실제 라우트에 연결한다. Q1은 목록 items/nextCursor·상세 alias/recentIssues/openClaimCount, 등록/tombstone 출처를 표시한다. Q2는 state/owner/alias/q/sort/order만 전달하며 workState는 전 페이지 수집 후 적용한다. 참여는 유효 v2 댓글의 원 FROM(/sid 제외)·TO·CC exact case-insensitive이며 TO:ALL 방송·mention·OWNER만의 관계는 제외한다. q는 제목 literal 부분문자열 또는 양의 정수/#정수의 정확 번호다. sort=number/created/updated·order=asc/desc, 제목 정렬은 전 페이지 후 client 정렬이다. updated 순서는 서버 반환순을 유지한다. opaque cursor는 조회 조건/principal에 묶이고 변경 중 고정 snapshot을 보장하지 않는다. 호스트 배포·브라우저 전건 수용은 별도 증거다.

## 9. 기존 P8와의 관계·파일 경계

관찰 기준은 2026-10-21 P8 s2 작업 중의 파일이다. s2 최종 RELEASE/HEAD/diff를 인계받아 아래 표를 다시 대조한다. P8의 새 B-03 코드를 이전 snapshot으로 되돌리지 않는다. 파일을 통째로 새 app으로 교체하지 않고 pages/features/resources 분해를 유지한다.

제출 전 [P8 s2 REPORT 6314068039](https://github.com/hikaMaeng/issus/issues/1#issuecomment-6314068039)를 추가 대조했다. `features/comment`의 `summary role="button"`은 B-01-2의 실제 browser locator 보완이므로 유지한다. `entry/client/readHistory`의 접힌 이슈 창은 COMPACT 이전의 미처리 inbox-union 항목도 화면에서만 제외하고, full 토글에서 복원하는 회귀를 유지한다. inbox·전구간 의무 배열을 이 화면 필터로 잘라내지 않는다. 위 REPORT의 source/host 결과는 해당 담당 증거이며 이번 명세 담당의 실행 결과로 합산하지 않는다.

| 기존 파일(front 기준) | 처리 | 유지·확장 또는 교체 이유 |
| --- | --- | --- |
| `entry/main.tsx` | 유지 | createRoot/App·스타일 import, root 오류 resources |
| `entry/app/index.tsx` | 확장 | 기존 auth·4개 경로 유지; sidebar·보조패널·새 UI 경로 조립. root wiring의 타 소유 파일은 요청 |
| `entry/client/index.ts` | 확장 | cookie/CSRF·allPages/readHistory/readInbox·errorLines 유지; 실제 issue summary/diagnostics 타입 보강·422 code/path front 어댑터 |
| `entry/socket/index.ts` | 유지·최소 확장 | same-origin cookie WS, abort/queue 상한 유지; 재연결을 재구현하지 않음 |
| `pages/repos/index.tsx` | 확장 | 저장소 목록 그대로, 선택·개설·완전성 상태 |
| `pages/issues/index.tsx` | 확장 | table/issue-row·이슈 상태 label 유지, 필터·정렬·검색·OWNER 열 |
| `pages/issue/index.tsx` | 확장 | 본문/스레드/작성/닫기·since-compact 유지, 참조·보조 정보·실시간 |
| `pages/inbox/index.tsx` | 확장 | P8 s2 WS 오류/재연결 상태 포함 보존, pending/영수/처리/반영 UI |
| `features/envelope/index.tsx` | 확장 | dl1개·term/definition 유지, 칩·링크·필드 key |
| `features/comment/index.tsx` | 확장 | article/createdAt/noenv/inert raw·단건조회 계약 유지, 앵커·접힌 OTHER·빠른 응답 |
| `features/comment/index.test.tsx` | 유지·확장(인계 후) | SSR는 기존 dl/h2/원문·사유 순서를 검증. 브라우저 수용 대체 아님 |
| `features/composer/index.tsx` | 확장 | raw textarea/검사/게시·key 재시도 유지, TYPE 폼·preview·필드 오류 |
| `features/delivery/index.tsx` | 확장 | delivery id·ACK/ignore dialog 유지, applied 근거·상태 버전·OTHER 접기 |
| `features/compact/index.tsx` | 유지·확장 | 현재 h2 마커 유지, 도우미는 별도 features/compact-assistant로 분리 |
| `features/closing/index.tsx` | 확장 | native dialog·blocker 이유 유지, 선행 조건 링크·reopen |
| `resources/index.ts` | 유지·확장 | 기존 ko 키/formatter·deliveryLabels 유지, namespace별 파일 export |
| `styles/index.css` | **스타일 내용 교체** | 현 light/16px/상단 nav 스타일을 §4 dark/14px/3열 토큰으로 교체; import 경로·DOM semantic 유지 |
| `README.md`, `docs/{overview,architecture,api,usage,constraints,internals,testing}.md` | U1 확장 후 U3 인계 | 새 경로·API 계약·markup·시험을 해당 문서에 반영 |
| `apps/issus/tests/browser/ui.test.mjs` | 유지·추가 | 기존9개+B-03추가3개 삭제/조건완화 금지, P9 케이스 추가 |
| `packages/issus_domain/src/front/**` | 읽기·재사용만 | IssusClient/subscribe/InboxModel 공개 export 사용, P7 소유 변경 금지 |

추가 경계는 `pages/{login,sessions,board,roster,issue-create,issue-edit,compact}/index.tsx`, `features/{app-shell,session,issue-filters,reference,issue-form,handoff,compact-assistant,roster,feedback}/index.ts[x]`, `resources/{session,issue,composer,inbox,board,roster,compact,feedback}.ts`다. 각 폴더는 해당 기능의 변경 단위이며 공개 `index.ts[x]`를 통해서만 소비한다. 최상위 barrel·manifest·compose·server route는 이 구현자가 소유권 없이 추가하지 않는다. 의존성을 추가하지 않고 현재 React·P7 client·native controls를 우선 사용한다. 새 라이브러리가 필요하면 exact 버전과 P1 요청으로 처리한다.

### 신규 폴더·파일 소유(정본)

| 단위 | 신규 features | 신규 pages | resources 파일 |
| --- | --- | --- | --- |
| U1 | app-shell, session, issue-filters, roster, feedback | login, sessions, roster | index.ts(공통 ko)·session.ts·roster.ts·feedback.ts |
| U2 | reference, issue-form, handoff(기존 envelope/comment/composer/closing 포함) | board, issue-create, issue-edit(기존 issue 포함) | issue.ts·composer.ts·board.ts |
| U3 | compact-assistant(기존 delivery/compact 포함) | compact(기존 inbox 포함) | inbox.ts·compact.ts |

기존 `resources/index.ts`의 ko/deliveryLabels는 U1만 편집하고 호환 키를 유지한다. U2/U3는 각 파일에서 `issueKo/composerKo/boardKo/inboxKo/compactKo`를 직접 export/import한다. 공통 index에 재수출이 필요하면 U1/P1에 요청하며 타 담당이 편집하지 않는다. 기존 feature의 시험은 같은 단위 소유다. U1 browser는 `tests/browser/p9-u1.test.mjs`·계획/보고는 p9-u1 전용 파일; 기존 ui.test.mjs 및 통합 p9-ui 계획/보고는 U3 소유다. front README·docs 7종은 U1 수정 뒤 RELEASE 시 U3에 인계하며 동시 편집하지 않는다.

## 10. 구현 분할: 3단위

단계마다 미결·실행 로그·검증 결과를 REPORT로 넘기고 독립 VERIFY를 받는다. 공유 entry/resources/styles 편집자는 U1 한 명으로 고정한다. 여러 담당이 같은 파일을 병렬 편집하는 배정은 하지 않는다.

| 단위 | 파일 경계(front 기준) | 의존 | 완료 조건 |
| --- | --- | --- | --- |
| U1 프레임·세션·탐색 | entry/app·entry/client·styles·resources(공통), features/app-shell/session/feedback/issue-filters/roster, pages/login/sessions/repos/issues/roster | P8 s2 RELEASE·명세 VERIFY; Q1/Q2는 명확한 disabled/부분 상태로 시작 가능 | dark 토큰·3열·main/nav/h1 계약, 안전한 토큰 교환·발급/재발급, 기존 목록과 가능한 필터·ROSTER 출처, lint/test·기존 semantic 회귀 |
| U2 이슈 개입 | pages/issue/issue-create/issue-edit/board, features/envelope/comment/composer/closing/issue-form/handoff/reference, 기능별 resources | U1 공개 client/error 어댑터, 기존 P4 API, Q1 선택지는 미확정이면 직접입력 | TYPE13·preflight/422/201·참조·NOENV·COMPACT 경계·게시판 제한·edit412·close blockers·handoff 단계·기존9건 유지 |
| U3 전달·요약·통합 | pages/inbox/compact, entry/socket, features/delivery/compact/compact-assistant, 기능별 resources, P8 인계된 browser/plans/reports·해당 docs | U1/U2·P5/P6/P7 공개 계약, Q1/Q2 결정/구현은 해당 기능 전체 수용 전 필요 | WS/SSE·영수/ACK/applied·E 병합·COMPACT metadata·재접속/중복0·P9 계획 전건; host deploy/browser·사람 다크테마 확인·독립 VERIFY |

U1의 공통 export가 동결된 뒤 U2/U3가 소비한다. 전역 resources index/styles/entry 조립 추가는 한 소유자가 취합한다. Q1/Q2 미해결은 해당 기능 BLOCKED로 보고하고 다른 단위는 진행한다. 전체 UI 완료 판정은 API 공백 해소와 §11 시나리오 전건을 요구한다. 루트 manifest·테스트 환경 전달·실제 deploy 변경은 P1/오케스트레이터로 요청한다.

### 교차 export·입출력·조립(동결 계약)

| 소유/export(public index) | 입력 | 출력·소비 |
| --- | --- | --- |
| U1 entry/client `createBrowserClient(token?)` | token?:string, 초기 교환/관리 호출 메모리만 | BrowserClient extends IssusClient; U2/U3 props client:IssusClient 호환 |
| U1 `connectBrowser(token)`·`hasBrowserCsrf()`·`clearBrowserSession()` | string / 없음 | Promise<void> / boolean / void; cookie교환·CSRF만 저장 |
| U1 `Principal` | auth/me | alias?,sid?,kind?,owner?,ownerId?,sessionId?,expiresAt? 모두 string |
| U1 `CommentView/IssueView/History/Page<T>/RepoView/IssueSummary` | 기존 P8 필드 유지 | 추가 summary ownerAliasId?/owner?/isBoard?/compactId?; optional로 호환 |
| U1 `errorLines(error)`·`errorReasons(error)`·`reasonField(reason)` | unknown / unknown / {code,path,message} | string[] / readonly ValidationReason[] / string\|undefined; 원문·순서 보존, code/path 보조 연결 |
| U1 `allPages<T>/readHistory/readInbox/issuePath/repoPath/ClientError/OperationTimeout/InboxModel` | 기존 P8 호출 호환; allPages의 선택4인자 onProgress?:(count:number)→void | 기존 결과 그대로; U2/U3 소비, 진행건수만 추가 |
| U1 resources `ko/deliveryLabels`·`sessionKo/rosterKo/feedbackKo` | 없음·formatter 인자 | 기존 P8 값 유지; 추가 파일은 §9 직접 import |
| U1 styles/index.css | :root[data-theme=dark] | §4 --ui-* 토큰; U2/U3는 색 literal 추가 금지 |
| U1 features/app-shell `AppShell` | {principal:Principal\|null,repo?:string,children:ReactNode,session:ReactNode,aside?:ReactNode} | main/nav/h1 프레임; 페이지는 h1만 포함, main/nav 중복 없음 |
| U2 페이지 `Issue/IssueCreate/IssueEdit/Board` | {client:IssusClient,repo:string,number?:number}; Issue/IssueEdit는 number:number | ReactElement; U1 entry/app가 최종 경로 조립 |
| U2 feature `Composer`·`Comment`·`Envelope`·`ReferenceLink` | 기존 props 유지; ReferenceLink:{client:IssusClient,repo:string,id:string,supersedes?:boolean} | ReactElement; U3는 공개 index만 소비 |
| U3 페이지 `Inbox/Compact` | Inbox:{client:IssusClient,principal:Principal}; Compact:{client:IssusClient,repo:string,number:number} | ReactElement; U1 entry/app가 최종 경로 조립 |

U2/U3는 U1 REPORT의 실제 시그니처 표를 확인하고 작업한다. U1 entry/app의 U2/U3 신규 경로 조립은 해당 export 완료 NOTE/REPORT 후 U1 또는 오케스트레이터가 수행한다(필요 경로·export를 requests에 기록). 기존 Issue·Inbox 경로는 U1부터 유지한다. U3의 inbox/stream/compact-assistant 모델·UI는 U1 계약만으로 U2와 병렬 착수 가능하다. U3의 통합 댓글 참조/작성기 연결 및 P9-04~16 종단 수용은 U2 공개 export 완료가 **선행 완료 조건**이다. U3가 U2 폴더를 임시 구현/편집하지 않는다.

시나리오 소유: U1=P9-01/02/03/13·P9-23 프레임/세션·P9-24 테마/인증. U2=P9-04/05/06/09/10/11/12/14/15/16·P9-23 댓글/dialog. U3=P9-07/08/17/18/19/20/21/22·P9-23 통합·P9-24 최종 배포 및 기존12 전건.

## 11. 시험 시나리오·실행 증거

아래는 **실행할 수용 명세**다. 이번 문서 세션의 PASS 기록이 아니다. Playwright는 `npm run deploy`로 생성한 production assets를 제공하는 격리 배포 대상에서 실행한다. 실제 Postgres/PGMQ·두 별칭 A/B·OWNER·board·과거 COMPACT/NOENV read fixture를 준비하고 product schema를 쓰지 않는다. NOENV는 P8의 시험용 read projection이며 production import API를 만들지 않는다. API 성공 payload를 mock으로 대체하지 않는다. 장애 주입은 실제 요청 지연·실제 WS 단절·실제 프레임 중복만 허용한다.

### 기존 9개 + B-03 추가 3개: 모두 유지

| 기존 ID | 고정 판정 |
| --- | --- |
| B-01-1 | main/h1/nav 주 탐색1·table 이슈 목록·issue-row 번호·link로 상세 진입 |
| B-01-2 | 본문/댓글 실제 dl·term/definition·원문 보기 |
| B-01-3 | NOENV 원문 warning 정확 문자열·raw HTML 실행0 |
| B-01-4 | latest COMPACT 기본·h2 marker·전체/이후 토글 aria-expanded |
| B-02-1 | ASK receipt→delivered·ACK preview는 무변경·명시 ACK→acked·근거 application→applied·reload 유지 |
| B-02-2 | 검사/게시 각각 HTTP422·reasons paragraph 철자/순서 일치·aria-invalid/describedby·잘못된 댓글 추가0 |
| B-03-1 | closed 필터의 빈 목록은 status `표시할 항목이 없습니다` |
| B-02-3 | 유효 ASK preflight→게시201·commentId article·reload 존속 |
| B-03-2 | native close dialog·label 유지·CLOSE_BLOCKED와 blocker id·취소 |
| B-03-3 | 실제 목록 GET 지연 중 loading aria-busy·table0 → 응답 뒤 table1·loading0 |
| B-03-4 | 최초+4재시도=5회 실패 뒤 `실시간 연결 오류` alert1·connected status0·snapshot 표시 |
| B-03-5 | 실제 WS 단절·새subscriptionId·단절중댓글 replay·실제event1회중복 주입·영수·전체중복행0 |

현 `ui.test.mjs`는 위 **12개**다. s2 작업 도중 다른 문서의 `9개`/`12개`를 무비판적으로 복사하지 않고 최종 인계본의 test() 목록을 대조한다. 기존 파일/ID/판정선을 바꾸지 않고 P9 전용 파일을 추가한다.

### P9 Playwright 신규 시나리오: 24개

| ID | 절차·주 locator | 필수 결과·증거 |
| --- | --- | --- |
| P9-01 | S01 `세션 연결` form에 B token → 연결 → auth/me → 저장소 링크 → 이슈 링크 | token 저장/URL0, principal alias/sid 정확, main/h1/nav1, 원래 내부 경로 복귀 |
| P9-02 | S02 bootstrap 명시 발급·최초token 연결; 같은key 재시도→재발급 확인 |201 1회token·409 token없음·새sid/reissueOf 명시·이전token401; secret 마스킹 증거 |
| P9-03 | S04 open/closed/all + STATE + 제목/번호 검색 + 번호/제목 정렬 | 전 페이지 완전성·AND결합·URL 복원·empty status. Q2 승인 시 OWNER/참여별칭도 실제 전역 결과 대조 |
| P9-04 | 로그인→이슈 열기→`댓글 작성`에 ACK-BY 없는 ASK raw 입력→검사·게시 | 두 응답422, 원문 사유 순서·ACK-BY 필드 보조연결·textarea 오류·DB 댓글증가0 |
| P9-05 | P9-04 초안을 정정→검사→게시 | preflight200 posted:false·댓글201/operation 최종201·새id1개·reload 동일·초안 성공 후만 비움 |
| P9-06 | 그 ASK에서 `수신 확인 작성` → preview → 취소 → 다시 ACK 게시 | 취소 전후 acked 아님, 명시 게시 후만 직접 TO delivery acked, RE 원id |
| P9-07 | S06 B inbox ASK 표시·영수→ACK→REPORT RE→반영 근거 기록 | posted/delivered/acked/applied 순서, 최초canonical/delivery 병합1행·reload 유지·외부성공 추정 문구0 |
| P9-08 | 지시에 B REPORT RE만 게시, 별도 NOTE/CLAIM에 ACK 작성 | legacy pending 해소와 ACK-STATE waiting 분리, NOTE/CLAIM ACK 허용, 지시 acked 위조0 |
| P9-09 | S05 COMPACT 포함 기본→전체→이후, 이전 RE/SUPERSEDES 링크 열기 | h2 정확마커·aria-expanded·단건 원문 dialog, snapshot/초안 유지·원댓글 중복0 |
| P9-10 | 우선수신 ME/CC/ALL/OTHER fixture·타인 HOLD/DECISION, OTHER 열기; HOLD 작성→검사/게시→직접ACK→DECISION SUPERSEDES 명시 게시 | 기본OTHER 봉투만·명시열기 전문·공유HOLD/DECISION은 어떤필터에도 전문·pending링크. HOLD ACK-BY≤10분/SEEN 정상201; 누락/초과422 두경로·초안유지/추가0. ACK만으로 active HOLD 해제0; 유효 DECISION의 SUPERSEDES 게시 뒤만 해제. DECISION ACK-BY누락422·잘못된SUPERSEDES 서버오류원문 |
| P9-11 | raw NOENV script/img fixture, 원문/재게시 요청 초안 | 경고 정확문구·스크립트/외부HTML 실행0·실행/자동ACK0 |
| P9-12 | S07 board 발견→NOTE 템플릿→검사·게시, ASK/HOLD 시도 | NOTE≤1500·REPLY-IN·REPORT참조, 금지TYPE UI안내+서버422·registry 충돌409 표시 |
| P9-13 | S08 ROSTER/registry·별칭 check exact/near conflict·등록/개명 | 출처·model/scope/sid, collisions 증거·409·tombstone; Q1 미해결이면 registry 완전 기능 BLOCKED |
| P9-14 | S09 이슈개설→S10 두context 동시편집→구버전 저장 | 개설201·문법검사표시, 412 초안유지·최신원문비교·명시병합 후200·자동덮어쓰기0 |
| P9-15 | S12 HANDOFF 게시→타인ACK/직접ACK→accept→complete | 타인ACK로수용안됨·유효ackCommentId·expectedRevision·단계별owner/책임·REPLY-IN |
| P9-16 | CLAIM DUE/SEEN 작성·검사/게시→DUE 경과→본인 CLAIM RE의 RELEASE→S11 blockers 확인→ACK/최종REPORT/COMPACT/terminal body 준비→닫기 | CLAIM DUE/SEEN 정상201·각누락422/초안유지/추가0, DUE만으로 CLAIM 해제0. RELEASE 본인CLAIM 연결 정상201·RE누락/타인CLAIM422 원문, 성공후만 해제. blocker id링크·before-close due보존·성공200/closed상태·후속링크·closed댓글409 |
| P9-17 | S13 24→25댓글/39,999→40,000자, board29→30·before-* | 서버due count/chars와 UI일치·구간중복가산0·임계OR·각 purpose 표시 |
| P9-18 | packet 준비/markdown 다운로드→원id3개표본→요약검사·게시 | maskedCount·token비노출·UTF8LF·metadata정확·footer접미사허용·포인터/revision확인 |
| P9-19 | packet 후 새댓글/편집→게시, 별도 만료Clock→게시 | stale409/expired410·게시0·초안보존·새prepare 명시·마커수정우회0 |
| P9-20 | 실제 WS 구독에서 다른 세션이 댓글/상태/본문/COMPACT/이슈 생성 | 상세/inbox 자동갱신·목록5초발견·새댓글이동링크·draft/focus유지·신규COMPACT경계안내 |
| P9-21 | 별도 명시SSE transport로 동일scope·단절·cursor재생·HTTPreceipt | 동일delivery/status·SSE frame/id·transport표시·ACK자동생성0. WS 오류수용을 SSE로 대체하지 않음 |
| P9-22 | 202응답 지연→operation조회·응답유실 후 같은key 재시도 | 대기상태와 operationId, 동일댓글1개·최종422전달·미확정성공표시0 |
| P9-23 | 키보드만 Tab/Shift+Tab·dialog Esc·참조포커스·900px/200% | 키보드진입/탈출가능·초안보존·focus복귀·main/nav유일·필수행동가로스크롤밖 |
| P9-24 | dark computed tokens/1440·1200·900 screenshot, inline code 실제 computed fg/bg WCAG 상대휘도 계산, 만료/revoke·CSRF없는새탭 | 지정색·14px·8px·shadownone·inline code #ff7b83/#2a2a2a 대비≥4.5:1(작은 글자 AA)·light선택기0·재인증·거짓connected0·secret trace노출0 |

Q1/Q2 미해결 시 P9-03의 해당 필터·P9-13 registry 전체 기능을 **BLOCKED**로 남긴다. disabled 상태만 통과했다고 완전한 UI 수용으로 합산하지 않는다. 시나리오 수는24, 현재 기존12와 합쳐 목표36건이며 실제 test() 분할 수가 달라지면 ID별 결과를 따로 적는다. 필수 시나리오를 skip으로 숨기지 않는다.

### 명령·로그·판정

구현 후 표준 검사는 `npm run lint -w issus`, `npm test -w issus`, 배포 후 호스트의 `ISSUS_TEST_SERVER_URL=http://127.0.0.1:18140 npm run test:browser`다. PowerShell은 `$env:ISSUS_TEST_SERVER_URL='http://127.0.0.1:18140'`로 지정한 뒤 명령을 실행한다. 기존 통합 시험은 `npm run test:integration -w issus` 및 P8 계획의 실제 entry harness를 유지한다. source/SSR/실DB/배포DOM/Monitor 실기를 분리 보고한다. DB가 필요한 경우 `ISSUS_TEST_DATABASE_URL=postgresql://issus@127.0.0.1:15440/issus`와 전용 `issus_test_p9_*` schema를 쓰고 기존 컨테이너·다른 schema를 변경하지 않는다.

브라우저 fixture 환경은 오케스트레이터가 공급하고 secret 파일은 읽지 않는다. Playwright·Chromium 설치와 host deploy는 P8/오케스트레이터의 검증 경계다. sandbox의 Vite/npm/Docker EPERM을 성공으로 바꾸거나 임의 설치/대체 서버로 우회하지 않는다. node:test/lint의 실제 stdout·exit·pass/fail/skip 수와 명령을 보고에 복사한다. 이 문서 변경만으로 브라우저36건을 실행했다고 주장하지 않는다.

구현 계획/보고는 인계 담당이 `apps/issus/tests/plans/p9-ui-20261021.md`, `apps/issus/tests/reports/p9-ui/<timestamp>.md`에 기록한다. screenshot·observed JSON에는 대상 URL/asset hash·시간·ID별 결과·연결세대·subscriptionId·누락/중복수·pageerror를 기록한다. 토큰/Authorization/cookie/packetToken·인증 trace는 기록하지 않는다. 사용한 locator(role/label/testid)와 모호성도 남긴다. 사람 확인은 dark 레이아웃·문구·정보 밀도를 확인하는 별도 마지막 증거이며 Playwright 실패를 덮지 않는다.

## 12. 인계 체크

명세 VERIFY는 화면13·컴포넌트48·Q1/Q2 계약 상태, 실제 API 표, TYPE13/enum/마커, P8 파일 재사용 표, 기존9+B-03추가3 보존, 신규24 시나리오를 대조한다. 구현자는 P8 s2의 최종 HEAD·RELEASE·browser 시험 목록을 받은 뒤 변경을 시작한다. 인계 export는 §10의 U1 동결표·실제 `issus_domain/front` 공개 API·기존 socket 계약이다. API 추가는 core 소유, 배포 변경은 오케스트레이터 소유다.

brief 요구1은 S03/S05/S07~12, 요구2는 S06/§7, 요구3은 S05/S13, 요구4는 §8의 CLI와 동일 HTTP/커서 의미, 요구5는 전체 semantic UI·§4, 요구6은 §11의 수용 증거와 연결된다. 서버·CLI·운영 수용은 기존 design §14를 그대로 따르며 P9 UI 문서가 대신 충족했다고 판정하지 않는다. 다음 담당은 `issus-1-review`의 독립 VERIFY다.
