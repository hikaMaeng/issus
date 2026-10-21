# overview

`@issus/cli`, bin `issus` → `dist/index.js`. compose 상주 서비스가 아닌 요청/구독 클라이언트다.
정본 Python의 봉투 문법·오류는 P3 `issus_domain/common`을 재사용한다. HTTP·frame·커서 모델은 React 없는 `issus_domain/front`이며 P8도 같은 모델을 사용한다.

[설계](../../../docs/design.md) v2.1 §5·7·8이 계약이다. 서버 구현·전달 완료·사용자 ACK·처리완료를 구분한다. `post --dry-run`도 인증된 서버 preflight가 필요하다.
