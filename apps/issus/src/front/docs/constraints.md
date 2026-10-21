# 제약

[design §7.3](../../../../../docs/design.md#73-최소-ui와-semantic-markup-계약)과 [루트 locator 표](../../../../../docs/constraints.md)가 고정 계약이다. main/h1 하나, nav 주 탐색, 이름 있는 region/form/dialog/table/ol, row/comment/delivery id를 제공한다. 검사 오류는 alert·aria-invalid/describedby, 성공·loading은 status다.

사용자 카피는 resources/index.ts, API reason·본문·봉투 값은 원문이다. NOENV는 읽기 전용이며 raw HTML을 실행하지 않는다. native dialog를 사용한다. bearer 저장·자동 ACK·화면 표시만으로 process cursor 전진은 금지다.
