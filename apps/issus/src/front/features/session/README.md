서버 확인 principal의 인증과 현재 탭 메모리 초안 복원을 제공한다.

| 목적 | 문서 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

외부 소비는 index.tsx의 공개 export만 사용한다. 인증 비밀과 요청 처리 상태는 초안 슬롯에 넣지 않는다.

HANDOFF 작성 내용은 이슈별, 빠른 ACK·inbox ACK 본문은 댓글별 슬롯으로 보관한다. 복원 뒤 후속 이슈 확인 등 서버 검사는 다시 수행한다.

연결 완료 뒤 details가 접히는 접근성 경계와 발급 결과/입력의 고유 이름은 constraints·testing 문서를 따른다.
