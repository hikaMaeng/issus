# 사용

상위 barrel 연결 후 workspace `issus_domain/common`에서 import한다. 연결 전 P3 자체 시험은 기능 폴더의 `index.ts`를 직접 import한다.

```ts
import {checkComment, parseCommentRequest, header, classify, pendingLegacy,
  ackState, compactDue, sinceCompactStats, mask} from 'issus_domain/common';

const reasons = checkComment(body); // [] = 문법 통과, 한국어 사유의 순서 보존
const request = parseCommentRequest({body}); // HTTP metadata wrapper/unknown key 거부
const h = header(body); // 레거시는 _noenv, 실행 근거로 승격하지 않음
const priority = classify(h, body, ['aa-reader']); // 정규화된 alias 집합
const pending = pendingLegacy(issueComments, ['aa-reader']);
const stats = sinceCompactStats(issueComments, latestCompactId);
const due = compactDue(stats, isBoard);
const packet = mask(assembledPacket); // 전체 조립본에 1회
```

`pendingLegacy`는 전달/읽기 범위의 댓글 전체를 받는다. 여러 이슈를 합쳐 계산하지 않는다. issue별 window/global을 각각 계산하고 API에서 분리한다. `ackState`에는 권한 검사가 끝난 directive projection과 직접 작성자 증거를 넘긴다.

`parseCommandPayload`는 actor/idempotency/owner를 붙이기 전 business payload decoder다. 경로의 repo/issue를 서버가 붙이고, parser 성공 뒤 인증 actor와 idempotency를 각인한다. scheduler tick은 별도 서버 경로다. 외부의 source 좌표/actor를 통과시키지 않는다.

서버는 `EventUnitOfWork({pool,eventStore,queue,clock?,reactions?})`와 `IntakeService({uow,resolvePrincipal,publication?})`를 조립한다. 외부 HTTP는 submit만, trusted intake worker는 executeIngress(event,context.fence)를 호출한다. 직접 BEGIN/COMMIT하거나 중요한 fact를 emit하지 않는다. 반응 소비자는 uow.run 안에서 applyProjection을 호출하며 queue/action 표는 app에서 주입한다.
