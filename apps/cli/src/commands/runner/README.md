Windows 호스트의 alias 지시를 멱등 journal과 CLI 자식으로 실행하고 ACK/REPORT를 확정한다.

| 목적 | 파일 |
| --- | --- |
| 범위·설정 | [CLI usage](../../../docs/usage.md#runner) |
| API | [CLI api](../../../docs/api.md#runner) |
| 제약 | [CLI constraints](../../../docs/constraints.md#runner) |
| 시험 | [CLI testing](../../../docs/testing.md#runner) |

공개 진입 `runnerCommand`, 주입 실행기 `HostRunner`. 폴더 경계는 options/state/delivery/prompt/report/process/adapters. 설계 정본은 루트 docs/bridge.md §8–11이다. 상태 저장·인증 실패는 다음 외부 효과 전에 멈춘다.
