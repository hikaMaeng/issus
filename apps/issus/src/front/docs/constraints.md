# 제약

[design §7.3](../../../../../docs/design.md#73-최소-ui와-semantic-markup-계약)과 [루트 locator 표](../../../../../docs/constraints.md)가 고정 계약이다. main/h1 하나, nav 주 탐색, 이름 있는 region/form/dialog/table/ol, row/comment/delivery id를 제공한다. 검사 오류는 alert·aria-invalid/describedby, 성공·loading은 status다.

사용자 카피는 resources/index.ts, API reason·본문·봉투 값은 원문이다. NOENV는 읽기 전용이며 raw HTML을 실행하지 않는다. native dialog를 사용한다. bearer 저장·자동 ACK·화면 표시만으로 process cursor 전진은 금지다.

실시간 연결은 aria-label=실시간 연결의 status(연결 중/연결됨/재연결 대기) 또는 alert(연결 오류) 하나로 노출한다. WS는 현재 origin과 동일 host·보안 수준만 허용하며 query token/별도 bearer 저장이 없다. 단절 뒤 구독id 교체·영수 커서 승계는 P7 계약이다.

원문 보기 summary에는 role=button을 명시해 브라우저별 native summary role 차이를 없앤다. 이슈 댓글의 기본 접힌 창은 latest COMPACT 자체+이후만 표시하며, 전구간 미해소 의무는 inbox에서 유지한다.

U1은 nav `주 탐색`, form `세션 연결`/password `세션 토큰`/button `연결`, form `세션 발급`, dialog `세션 재발급 확인`, table `이슈 목록`·issue-row, table `ROSTER`/`별칭 레지스트리`·alias-row를 유지한다. 422 paragraphs는 원문·순서 보존, 보조 필드 연결은 정확한 path/정본 required-key 문구만 허용한다.

14px·8px·shadow none·3열은 ui.md §4 CSS 토큰 정본이다. inline code #ff7b83/#2a2a2a의 작은 글자 AA 대비≥4.5:1. 카피는 resources 파일에 두고 서버 reason·원문·TYPE/키는 번역하지 않는다. native dialog Esc는 닫기와 트리거 focus 복귀이며 draft를 게시하지 않는다.

bearer는 local/session storage·URL·로그에 기록하지 않는다. 저장은 issus.csrf만이다. 관리 입력은 성공/패널 닫기/페이지 이탈 시 제거한다. 발급 token을 캡처·trace에 기록하지 않으며 브라우저 스크린샷은 입력을 마스킹한다.
