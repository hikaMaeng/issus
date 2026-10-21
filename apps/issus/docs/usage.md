# usage

루트 npm run deploy 또는 npm run deploy -- issus로 배포한다. 기본 UI는 http://127.0.0.1:18140, 준비 응답은 /ready다.

P4 HTTP 하네스 시험은 루트에서 ISSUS_TEST_DATABASE_URL을 설정하고 `npm test -w issus`를 실행한다. production entry는 core·delivery·compact·WS/SSE를 연결한다. [bootstrap secret mount](../../../docs/usage.md)는 호스트 `npm run deploy`에서 준비한다. standalone 하네스의 PASS를 배포 상태로 사용하지 않는다.

COMPACT는 status→prepare 또는 packet→새 컨텍스트 요약→표본 대조→comments 게시 순서다. stale/만료이면 새 packet을 받아 다시 요약한다. 댓글 조회는 기본 sinceCompact=true이며 compact 원문과 이후 items를 함께 소비한다.
