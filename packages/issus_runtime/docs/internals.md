# internals

0001은 P3 SQL asset,0002는 bootstrap_auth/browser_session,0003은 canonical history_snapshot이다. 연속 번호·중복 번호·기존 checksum을 schema lock 아래 검사하고 pgmq extension과5개 큐도 준비한다. ensureBroker가 끝나기 전에 ready로 노출하지 않는다.

session token은 CSPRNG32byte/base64url, DB는 SHA256이다. createSession의 command_result는 sessionId/alias/sid/expiresAt만 보관한다. 동일 key와 지문은 token 없는409로 변환하고 새 key의 explicit reissue만 old revoke/new session을 허용한다. 결과 저장·event append 실패 시 token은 반환되지 않고 DB도 롤백된다.

브라우저 cookie token과 CSRF는 각각 `HMAC-SHA256(sessionBearer, browser:<key>)`, `HMAC-SHA256(sessionBearer, csrf:<key>)`로 만들어 같은 key 재시도를 재현한다. DB에는 cookie/CSRF hash·session·origin·만료만 보관한다. bearer token 원문을 runtime 설정이나 migration에 보관하지 않는다.
