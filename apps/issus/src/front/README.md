issus 최소 React UI: P7 client/model 위에 저장소·이슈·봉투·받은편지함·댓글 작성 화면을 제공한다.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

entry/main.tsx→entry/app, pages별 화면, features별 봉투·댓글·COMPACT·작성·전달·닫기, resources의 한국어 카피다. build는 app의 Vite, 운영은 Express static이다. [루트 운영 문서](../../../../docs/usage.md)를 따른다.

inbox 실시간 연결은 entry/socket의 same-origin cookie WS와 P7 subscribe를 사용한다. B-03의 연결오류·단절/재연결·중복행0은 [시험](docs/testing.md)의 필수 수용이다.
