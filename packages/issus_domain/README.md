issus의 봉투 v2·wire 계약·검증/집계·SQL baseline·원자 명령 처리.

| 목적 | 파일 |
| --- | --- |
| 개요 | [overview](docs/overview.md) |
| API | [api](docs/api.md) |
| 제약 | [constraints](docs/constraints.md) |
| 시험 | [testing](docs/testing.md) |

[구조](docs/architecture.md) · [사용](docs/usage.md) · [내부](docs/internals.md) · [baseline](src/server/backend/schema/README.md)

설계 정본은 [design v2.1](../../docs/design.md). 순수 계약은 `issus_domain/common`, 서버는 `issus_domain/server`로 소비한다. 최상위 barrel 연결은 P1 소유이며 P4 서버 공개 경계는 `src/server/backend/index.ts`와 `src/server/intake/index.ts`다. 전달·스케줄·COMPACT 패킷 생성은 P5/P6 소유다.

| 서버 공개 API | 고정 시그니처/용도 |
| --- | --- |
| `EventUnitOfWork` | `new(options:UowOptions)`; `run(work,key?,identityScope?)`, `read(work)`, `snapshot(work)` |
| `EventTransaction` | `client`, `now`, `table(name)`, `fact(action,channel,payload,label?,audience?,kind?)`, `enqueue(queue,event)` |
| `reserveCommand` / `finishCommand` | `(client,table,principalId,key,hash)` / `(client,table,record,HttpResult)` |
| `verifyReactionSource` / `applyProjection` | `(tx,input,ownerId)` / `(tx,name,input,ownerId,work)` |
| `authorizePrincipal` / `authorizeRepo` / `requireOwner` | `(tx,principal)` / `(tx,principal,repoId)` / `(tx,principal,ownerAliasId)` |
| `IntakeService` | `submit(CoreCommand)`, `execute(CoreCommand,fence?)`, `executeIngress(event,fence?)`, `preflight(...)`, `operation(principal,id)` |
| `CompactPublication` | `(tx:EventTransaction,input:CompactPublicationInput)=>Promise<void>`; P6 주입, 기본 no-op |

P5/P6은 공개 UoW를 호출하며 내부 BEGIN/COMMIT·best-effort emit을 추가하지 않는다. `run`의 identityScope는 외부 명령이면 principal.id, 반응이면 projection/반응 실행 범위다. 반응표는 app이 주입하고 도메인에는 큐별 처리표를 복제하지 않는다.

원 사건은 `DomainFact`/`parseDomainFact`, P2 변환 뒤 worker 소비 command는 `ReactionInput`/`parseReactionInput`으로 구분한다. [반응 교차 시험 계획](tests/plans/reaction-input-20261021.md).
