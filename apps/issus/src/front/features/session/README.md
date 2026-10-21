서버 확인 principal의 인증과 현재 탭 메모리 초안 복원을 제공한다.

| 목적 | 문서 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

외부 소비는 index.tsx의 공개 export만 사용한다. 인증 비밀과 요청 처리 상태는 초안 슬롯에 넣지 않는다.
