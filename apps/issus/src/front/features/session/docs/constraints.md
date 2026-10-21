# 제약

bearer·관리 토큰·CSRF·packetToken·WriteAttempt/key·operation·검사 성공·권한 principal은 초안 슬롯에 저장하지 않는다. 초안은 브라우저 storage·URL·로그로 복제하지 않는다. 사용자가 본문에 직접 쓴 텍스트는 원문 그대로 보존하며 자동 자르기·재작성은 없다.

기존 form `세션 연결`, password `세션 토큰`, button `연결`을 유지한다. 복원/버리기는 `보관한 초안 복원`·`보관한 초안 버리기`라는 실제 button이며 안내는 status다. testid·CSS/XPath locator는 추가하지 않는다. 같은 alias여도 sid가 다르면 이전 FROM을 복원하지 않는다.

연결 form은 초기 인증 복구 중에도 존재한다. 비인증 복구 완료 후 details가 열리고 인증 성공 후에는 새 sessionId의 details가 접힌다. 완료 검사에는 includeHidden role locator를 쓰고 입력·click은 보이는 form에서만 한다. `발급 세션 결과` region과 password label `발급 토큰`은 서로 다른 이름이다.
