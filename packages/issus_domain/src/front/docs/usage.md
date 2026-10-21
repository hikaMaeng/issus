# 사용

```ts
import { IssusClient, InboxModel } from 'issus_domain/front';
const client = new IssusClient({ server, token: () => currentToken, fetch });
const model = new InboxModel(saved.cursors, saved.versions);
const { data } = await client.request('/v1/inbox?' + query);
model.acceptPage(data);
```

다음 페이지까지 모두 받아 출력한 뒤 `model.cursors`를 원자 저장한다. peek면 저장하지 않는다. `subscribe`의 onFrame은 durable 소비/출력 성공 후 resolve하고 save는 외부 파일/UI 저장소에 last receipt cursor를 기록한다. Node의 bearer WS는 CLI 어댑터를 주입한다. 브라우저는 cookie/허용 transport에 맞춘 factory를 P8이 제공한다.
