# api

| export | 계약 |
| --- | --- |
| `parseRuntimeConfig(data=process.env)` | DATABASE_URL/OWNER/bootstrap 파일 경로/ORIGIN/PORT 필수, listener10000–59999 |
| `createRuntimePool(url,brokerSchema='public')` | 명시 URL만, public broker search_path, 시험만 격리 namespace |
| `runMigrations({pool,schema?,baselineSql?,migrations?,directory?,queueName?,ensureBroker?})` | baseline+연속000N 파일·checksum·schema advisory lock, `{applied}` 반환 |
| `runtimeAuthMigration`, `runtimeHistoryMigration` | 독립 시험의 baseline 뒤 붙일0002/0003 SQL |
| `new RuntimeAuth({uow,sessionTtlSeconds?,onRevoked?})` | 기본86400초, DB 해시 저장 |
| `installBootstrap(ownerName,tokenHash)` | 최초 owner/bootstrap 설치, 다른 hash로 암묵 교체 불가 |
| `verify(token)` / `forget(token)` | agent SessionVerifier 구현, read-only/캐시 없음 |
| `corePrincipal(runtimePrincipal)` / `resolveActor(actor)` | HTTP·worker의 owner/alias/sid/session identity 변환·재검사 |
| `createSession(principal,request,key)` | 최초201 token, 동일 key409 SESSION_TOKEN_NOT_REPLAYABLE, 지문 변경409 |
| `revoke(principal,id,key)` | bootstrap/self만, 해시·session 상태 폐기 및 secret 없는 fact |
| `browserSession(principal,origin,key,bearerToken)` | 동일 actor/key 재생 가능한 cookie/CSRF, DB에는 해시만 |
| `verifyCsrf(cookie,csrf,origin)` | cookie mutation의 scope·CSRF 확인 |
| `createHealth({pool,schema?,migrationIds?,queueName?,initialized?})` | `live()` / `ready()`, DB·pgmq·migration·queues·초기화 checks |

token이 있는 최초 세션 발급 응답을 command_result/operation/event에 복사하지 않는다. browser-session은 세션 bearer와 UUID에 HMAC을 적용해 원 응답을 재구성한다. 쿠키 토큰·CSRF의 원문을 DB에 저장하지 않으며 일반 멱등 규칙을 유지한다.
