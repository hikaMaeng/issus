issus 사람용 React UI: 다크 3열 프레임·세션 발급/연결·저장소/이슈 탐색·ROSTER와 기존 댓글/받은편지함을 제공한다.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

entry/main.tsx→entry/app, pages별 화면, features별 봉투·댓글·COMPACT·작성·전달·닫기, resources의 한국어 카피다. build는 app의 Vite, 운영은 Express static이다. [루트 운영 문서](../../../../docs/usage.md)를 따른다.

P9 정본은 [ui.md](../../../../docs/ui.md) v1.1. 공통 client/resources/styles·프레임/세션/탐색은 U1, 이슈 개입은 U2, 전달·COMPACT·통합은 U3 경계다. U2/U3 신규 화면의 최종 경로 조립은 export 완료 뒤 취합한다.

inbox 실시간 연결은 entry/socket의 same-origin cookie WS와 P7 subscribe를 사용한다. B-03의 연결오류·단절/재연결·중복행0은 [시험](docs/testing.md)의 필수 수용이다.
