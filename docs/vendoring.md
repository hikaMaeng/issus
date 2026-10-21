# Vendoring

## agent 이관 필수 기록 (P2)

동일 소유자 사설 이관 허용 근거: DECISION 6307832679 Q2. 외부 공개 배포 가능 여부: **미확인**. 임의 라이선스를 부여하지 않는다. P2 소유는 이 절과 `packages/agent/**`다.

| 필수 항목 (설계 §1.1) | agent 값 / 근거 |
| --- | --- |
| 출처 repo·로컬 경로 | `hikaMaeng/ndx_business` · `F:/dev/ndx_business/packages/agent` |
| HEAD | `d52c71e92493ec33584c09d679c789e15cf70086` |
| 관측 dirty 목록 | 아래 source dirty 전문; agent 경로 dirty 없음 |
| 복사 시각 | `2026-10-21T05:04:42.946102+00:00` (UTC) |
| 원본→목적 경로 | 아래 69행 및 [byte manifest](../packages/agent/docs/vendoring-files.json); server 공개 barrel도 포함 |
| 파일별 SHA-256 | 아래 원본/최종 목적 hash; 원본 재검사 `2026-10-21T06:42:48.883869+00:00` 일치69/69 |
| 라이선스 확인 결과 | **없음, 소유자 동일**. root/packages/agent 경로 LICENSE·COPYING 미발견, source package/root manifest license 미설정, 복사 대상 SPDX 미발견 |
| 제외 목록 | `node_modules`, `dist`, `.env*`, `.git`, 원본 `.cache`·캐시·런타임 데이터; admin/vibeagent 구현. agent 직하 실제 제외 이름은 `dist`; 내용을 열거나 복사하지 않음 |
| 패치별 이유·시험 | 아래 §1.1 행별 추적. 원본 56개 시험 유지, 설계 변경 기대값3건 갱신. 새 회귀·실제 TCP WS/별도 실DB 시험 추가 |
| 파생 버전 | `agent@0.1.0-issus.1` |
| 재동기화 절차 | 아래 절차 적용; 원본 직접 수정 금지 |
| registry 확인 명령·결과 | `npm view agent name version dist.tarball --registry https://verdaccio.neurondev.net/ --fetch-retries=0 --fetch-timeout=15000` → `ERR_SSL_TLSV1_UNRECOGNIZED_NAME` (2026-10-21T05:22Z). 후보 없음으로 단정하지 않음. 공식 npm metadata HTTPS GET에서 pg8.23.1/ws8.22.0/@types/pg8.23.1/@types/ws8.18.2 확인, P1 호스트 설치 관측. `.cache/p2/registry.log` |
| image tag+digest | agent는 이미지 소유 없음. DB 기준 tag `ghcr.io/pgmq/pg18-pgmq:v1.10.0`; P2 Docker npipe 접근 거부로 digest **미검증**, 아래 P1 DB 이미지 기록을 정본으로 사용 |
| 공개 배포 가능 여부 | 미확인 |

관측 source dirty 목록(복사 시점):

```text
 M ../vibeagent_domain/src/server/inference/llm/idle.test.ts
 M ../vibeagent_domain/src/server/inference/llm/index.ts
?? ../../.codex/
?? ../../AGENTS.md
?? ../../README.md
?? ../../apps/admin/AGENTS.md
?? ../../docs/api.md
?? ../../docs/architecture.md
?? ../../docs/constraints.md
?? ../../docs/internals.md
?? ../../docs/overview.md
?? ../../docs/testing.md
?? ../../docs/usage.md
?? ../../pgview-run.mjs
?? ../../tests/model-eval/
```

### P2 패치 추적: 왜 · 무엇 · 시험

| §1.1 원본 행 | 왜 · 무엇 · 시험 |
| --- | --- |
| `src/common·server/id·front·broker+시험` | 원본 재사용 · 공개 entry와 원본 시험 파일 전부 복사(server/index 포함) · 69파일 원본 hash 대조 및 runtime export 검사 |
| `broker/auth` | 계정 결합 제거 · Principal/SessionVerifier 주입·오류 비노출 · policy/index.test.ts, HTTP/WS 401 |
| `package.json` | 독립 workspace · admin_domain 제거·exact pg/ws/env-schema·express peer+dev·scripts/exports 유지 · lint/build/runtime export |
| `policy·service·http/app` | 앱 인가/라우터 소유 · verifier/socket policy·authorizeChannel 주입·account proxy/URL 제거·extendHttp를 static 전 등록. DECISION 6309746634 (2): optional ready hook을 /ready에서 queue·DB와 함께 await, 생략은 기존 동작 · http/app.test.ts(hook 성공/생략200·throw/거부503·queue/DB 실패503·지연 await/재호출)·WS 거부 |
| `database.ts·env.ts` | 기본 계정/다른 schema 차단 · public search_path·필수 DATABASE_URL·env-schema 후 설정 주입. DECISION 6309173472 후속: PORT 정수10000–59999·execution lease>visibility 기동 검사 · database.test.ts·policy/index.test.ts·env.test.ts(PORT65536/경계/lease≤visibility 거부) |
| `event-store/store append` | 도메인 UoW 원자성 · appendManyOn·wrapper·동일 tx sequence/notify·legacy UPDATE 제거 · event-store/patch.test.ts·실DB rollback/notify 시험 |
| `store 보존+service` | 이력 유실 방지 · retentionDays:null·기동/주기 history prune 제거·cursor TTL30 별도 · null 회귀·실DB old fact 보존 |
| `cursor store+WS` | 미수신 건 건너뜀 방지 · scoped immutable UUID·send마다 새 INSERT·모든 구독 인가 · cursor 회귀·WS 재접속/범위 거부 |
| `transport/websocket+channel` | 전송/도메인 경계 · subscription/receipt callback·shape≤100·ready 하드코딩 제거·error frame·seed barrier · WS 401/1008/1013·257건 재생·프레임 parser |
| `loops/reaction-enqueue` | 오래된 미처리 fact 회수 · 최초{}·reader exists 구분·페이지별 저장·command 제외 유지 · reaction-enqueue/index.test.ts |
| `reaction work+event/ingress/channel/store` | U-E1 출처 보존 · top-level source3개를 queue/draft/store/parser/worker로 전달·payload 불변·누락 보존/경보. DECISION 6309173472 후속: toResultDraft가 요청 audience 상속 · draft result/conflict 회귀·실DB replyChannel 없는 댓글 반응 소비→worker result 저장→client high-water/replay 제외 |
| `loops/worker-consumer` | 일시 장애의 영구 실패 방지 · 모든 미분류/DB 오류 release·재시도·명시 도메인만 종결·fact emit 금지 · transient6종/DomainError/emit 회귀·실DB40001 |
| `worker·mailbox·replay-buffer·notify·pgmq·metrics` | at-least-once 유지 · sendOn·fact/control 드롭 금지·느린 연결1013·thread DomainError 보존 · pgmq/client.test.ts·mailbox/replay·실제 WS 회복 |
| `README/docs/tsconfig/test runner` | 출처 잔재 제거 · README+docs7종 issus 기준·원본 tsconfig/루트 runner 연결·계획/보고 추가 · 링크/UTF-8 LF·lint/build·전체 시험 |
| `node_modules/dist/.env/.git/cache` | 오염/자격증명 유입 방지 · 제외 · source byte manifest 포함 경로 검사 |
| `admin/vibeagent 구현` | 도메인 범위 보존 · 미복사 · admin_domain/accountBaseUrl 잔재 검색0 |

판단: infra/미분류 예외는 attempt 상한 뒤에도 terminalize하지 않는다(도메인 오류만 종결). `reactionQueues` 등록과 원 fact owner/action 대조는 소비 앱의 필수 통합 계약이다. schema DDL lock은 pinned client tx로 바꾸어 pool에 session lock을 남기지 않는다. 실DB 접근 불가/표준 runner sandbox EPERM은 별도 미검증으로 보고하며 unit/실제 TCP WS 증거와 혼합하지 않는다.

### P2 파일별 byte 기록

각 상대 경로 `p`는 `F:/dev/ndx_business/packages/agent/p` → `F:/dev/issus/packages/agent/p`다. SHA는 원본 byte와 최종 목적 byte이며 내용 패치/UTF-8 LF 변경은 목적 hash에 반영한다. 신규 회귀/문서 보조 파일은 원본 hash를 꾸미지 않는다.

| 원본→목적 상대 경로 | 원본 SHA-256 | 목적 SHA-256 |
| --- | --- | --- |
| `src/common/index.ts` | `801567895cf5a47b463852b77eb9ebc72b4d72bafb3911cde8c3605bac694221` | `5f205608a4c46c036c94c9dd6aa0387b61b80ba4548726fb192f8846ad331c6a` |
| `src/common/protocol/channel/index.test.ts` | `a976fef3e121799e7c8d82360a7c0b85dc03cd8305b112c7590dfcbb3a10ece7` | `d4e81a604a1ee88165b877141feb3d26cc8139b26d6780ffae4cada77d2aedcc` |
| `src/common/protocol/channel/index.ts` | `dd4fe39753cd2110689f73e3eb00df86be5f5b51d709ecbe66f846606ef4f273` | `4efe71c8b1c8b793c097d6db0df39dca988ab1d9d0fcb12b36aaf93a4bbc4389` |
| `src/common/protocol/event/index.test.ts` | `2b0e7f09603c4d31d342c1170c60d7a6f508c0dcdcc595bec0dee0bc431a59ba` | `fbe909983331113a776eb836b0b0b836650df96ccea8127dd48298b3bb54bf6a` |
| `src/common/protocol/event/index.ts` | `6a5873a18a0b5b122ef90bdcd6624a83c71bcd13b0cf30ed1876cf8e7430b9d6` | `18dfb27270bea1bf744253e34e4bd0aec3a301161fa837bf7e80bc7777582bc0` |
| `src/common/protocol/metrics/index.ts` | `8a0fc81ab340ad4ff652ff3be52e65580565731d2b6acdf93a8b2f62d6e09ab2` | `e1e624cbdf5a2f65ae5090f68ea2cb18d698c10329897192d85d6cdbae7da961` |
| `src/common/protocol/result/index.ts` | `e26f5db55a7f2005071f502714d8769ce64a6cacf5c71eb90e3203845ee689a4` | `e55a1628678889c54f1d83f8ab64738fe92d7659f67d08c20629166bc80453d9` |
| `src/common/protocol/stream/index.ts` | `4b7a03acf96437563003c5424bd3ed63d6e95d8c1c36afc430cce1bc23f93705` | `c019474b0d4d1089da6c129f8e5fc8bff0b9b9b53f895372f071fadeaf2da36a` |
| `src/server/id/index.test.ts` | `64e13875e8f1cc104057f3f98481bd20acecbc7711ccc8fc8feba7f380abc119` | `11b44d6b0dfd7d4e07738dfb85ab42aac0769dac62960b4e413fad8002976ac2` |
| `src/server/id/index.ts` | `487f22802cc1ab91cded240c95f0a56b22f2d7db9de44882eca86c1f0293f814` | `b917736ccd9a58596b94542c8d658583be14aeb5972ab02852efe34d0546732d` |
| `src/server/index.ts` | `1aa755bd4085dc0847ee8d18c52883e8f2deade0e96828a992c01ff8fe5e62f3` | `5f5628b38908bf9ea63d5d27ce5e9353fcffa8fac518abbf0343901df8853bfe` |
| `src/front/client/index.ts` | `83b839f29d0cdc674a81e4af72c3554e33f1e96845a6211f8c7a0dcd328c7798` | `4f032b8c387ac482c543250908dae4c65eb43081842576363d01328f316706f3` |
| `src/front/index.ts` | `949e551245d355a24acd476a3259b5fd8e090024b7a9736de898b1fed1941235` | `9612f31079f8b0b4dcf65edc59fce2a8100c8d1905f2e454b54516f4c6d6a250` |
| `src/broker/auth/index.ts` | `1d3b312ac4022ebf3b9b685e1e424a716e8225e69c7d003fa5baea3393c7a0f4` | `f4298438ec9d094a2d23b71b9ebf421ab8fc9da0d66a3bfee40a23ff35bc0009` |
| `src/broker/database.ts` | `d686fffbb3555ca282099945ebcbd59203a20fb09679f32197becd5ae47e85a8` | `018440a9366d95bc6dec9660813dfaab324799c03462066cc8437c9beed29410` |
| `src/broker/env.test.ts` | `91e678df5d2a396a7cde1e825dd5b59c66d1229e9d59a040f82714ba39ea325f` | `205fa6f21f49e7a7f370685c7f92bdc73dfe2eba1d02b4ead73909e8a969a768` |
| `src/broker/env.ts` | `a09290d469310ac6fb4043a2d2244a3236c8170c1e7aeb9286cbdd8f7838cf4a` | `41a6cbaba6159968b92bd091c04ed96844e69160126b1d703c182beb309350a5` |
| `src/broker/event-store/notify.ts` | `898d4a53f9db734d7958625e331478ae9077b4e205475731b02c231e28d25844` | `90fcf584133eb2c7a1cec52b9b95d5be467b6e8e7fee9e029e1c515cb912643c` |
| `src/broker/event-store/store.test.ts` | `f809a2f93e0969ca693f37221fc48cbe635565b34ebcb03523d22b9c3515898b` | `ffc162c4d1be670adf72c574eaa76a203df3be41c210e67acd5488e6788c3090` |
| `src/broker/event-store/store.ts` | `5d802eb340cb4fa52d713ab5c1622f871922fc065ac599352992a74b13042d10` | `06bf0c61568a11935f8e87ad44dbe92a0de344225b0b65c597ddc2f4f1d2c549` |
| `src/broker/gateway/lifecycle/index.test.ts` | `cd09f68c9451853f073b366a6716175663f948b530a5f6d6a700c5f180cb3b8b` | `e83a5b082be78bba5fdc49eb35f306b12f9552a06b4a231316b482634a8e62a2` |
| `src/broker/gateway/lifecycle/index.ts` | `332b6a4340fd4a960be16c3995ea375434548389e6c4582ff2abea36aa202f95` | `ccbdae8a5c2b582eb9c49eb68fde6587f444d65954907f35bc505269f075c454` |
| `src/broker/gateway/standby/index.test.ts` | `22893faec7a06a2ea115f1313474d1ca54dce8540223b939f90a35094eeab2c0` | `25f37021ad87d56994ccea4a8aa8681a49b9efa496e5e8a14e286afa9add047d` |
| `src/broker/gateway/standby/index.ts` | `1e32889a4e54a1c8a29f67e62285e84ec6dbf744b7491748513a3d3ca747217d` | `931c8f6f50934b30b4feb6f2f2d48148e7d3a4ad54a6e06ba99e173f64359bbc` |
| `src/broker/http/app.ts` | `f94261047fb6bbf956a19d601b8f1d303a8bf5719af454f9ff10ba645d30c0f7` | `42080082d75b0033a095befe008bc38625aa2de003a42d7da2a2d62f2415275f` |
| `src/broker/idempotency/store.test.ts` | `d5cdeff883e95e75538295df32f5bd3fa177a3b3468d194311c681f167ffcd1c` | `00608aa65122a4548b50d35628640be4e10a4ad67f104be2b9748cf23fa0c6b3` |
| `src/broker/idempotency/store.ts` | `e352cfffab48f4cafee3acc4c1175baf131f7d26d67f5664fc30b6e6d5e17a0e` | `36652cf346b85e870396942bef868d20010266804dba711bd507faf899ad68ea` |
| `src/broker/index.ts` | `a097ab9c24ce532a6adde36eda1740c41b56dde98f9e689b5d685ac658f41ed2` | `85651180bcc30226ab0e263a18e374427e1aab2d71fdbb563fe62347b6c8d20d` |
| `src/broker/ingress/event-draft.test.ts` | `2e2add52ce92f7cc076aac5da79548850685c7942b8b7b4c38ca48e2b678ae77` | `07f1b9b384f53e016c3c840053007a562af96e81fccc0ecc9425e29184bb59fe` |
| `src/broker/ingress/event-draft.ts` | `eec1cee3daf0743dbeac73c71e505b317c9cb4adbec8e61a7555c086cb079ed2` | `2adf1c91f3b97c683a4da19da4ad8524848314dfe9ba84453c1b542e89aabf18` |
| `src/broker/loops/backoff.ts` | `0443fdc0ddf8e47b676a7d8a62775eebf0c8c187b5907ad9de883d229733fb24` | `0f52d828be001413825fa9c1cc271cdc71a4a9830c3828708fa2a33124f9de98` |
| `src/broker/loops/log-tail/index.test.ts` | `ead40d1d0b33548589a05f0e91ee10853e8005e65266b309dac932293e1b8ca5` | `d75ca6f43d089df3622f5feb0d16f71ce68dc26394704560ef6c47256fd34c01` |
| `src/broker/loops/log-tail/index.ts` | `02e1fa5d491c1ce0338848a9fbed96b8ea8db1ee535489e94ade2982bc4358fe` | `2fbc20365203a989fddbf8f5e59f8e255d5966a51ea24f1c3d5510b70eb66002` |
| `src/broker/loops/notifier.test.ts` | `5d9eedc2140ae8392078cc21a093c2922edba2266b366be84904377218eef0b5` | `0495794cda4381a7810ee9c08f4e2a0f68e5962eb5ddf5588ccdfc7e74bdca0b` |
| `src/broker/loops/notifier.ts` | `50172696c35e10ac7a8562261f47f4ee8f2181f06b52a6f52424f7db664f5b12` | `cd90f6f7bd9dc6d92dba6b57a37b3dc852d5cc65c622791785234a6841dc719c` |
| `src/broker/loops/reaction-enqueue/index.ts` | `720d3e8bcbf44fa5c1d3ee6b900afaec692d0e1d6072727abf5a1488e489d574` | `e44022f3969a56451f02bb82329fc0c9f47b5bacf5d33067e743cf651e8cca22` |
| `src/broker/loops/reaction-enqueue/lease.ts` | `1c5b07553cdf9224eb98a734228bbcbcf6b4f098d2c9d11ec0fb0313cb8fbdeb` | `24f9f2b0000e7d21a36dd315146eecfb7d31b9c627face5776f6b04fe92c6082` |
| `src/broker/loops/worker-consumer/index.test.ts` | `5b55cd1abea092d5bd4e8fcefea1aad73944f577e1669ba7c89770d74d8aadcf` | `bccab5e306e7f7aa57d38756e3964bc92ed4bab72c946f9fc2d6781992868977` |
| `src/broker/loops/worker-consumer/index.ts` | `fdf1d8202eef94444b8f7785f066335a8ec450d2be8367e5a3aed0339d350448` | `8c9ea7816c97434e27200d7255ce7d18e2a430e2d4b6992766e50fff839349b9` |
| `src/broker/metrics/endpoint.ts` | `8f90132a136665605641eaee5cfbf6bce5c25d0a9521d3560356bdc1f93d35de` | `4b16d4128e950fe40bccf381264388a95e7c9be8c4fcff15765c8824c2877c51` |
| `src/broker/metrics/registry.ts` | `3e35eff2531c9e2ce23b264d7e965663b8fb1af7c85df36858e3025c2e7bd94e` | `6aa2be6a0ffa1e1d1a9090c8d7ad5b9d3ec7db4f2a84913a3f59975d5296c1fc` |
| `src/broker/pgmq/client.ts` | `50c30e05d43c96e49e445e43e6f1c7f229e89ea44cad7f5661bb714c409959b9` | `5d166d8f962cf9cbdc785eb95b688054f170074f1ea3b1788d674d8131dbb602` |
| `src/broker/policy/index.ts` | `601624d0dbd2a39719fbd25a771092133f6d648ac1761496dcefc2394dc1ac33` | `6d4c75083fc944d0feb92987a8701239e768979a0a778ef366d55d68ed0f2a62` |
| `src/broker/queue/transport.ts` | `283760e9f8212f94db7cf8ff92bbcd96e3099e53f06558ddf96f7018b3da006d` | `701a01aee2562b914022a65eeda16593f02c10f640443e1e413fe29e8876320d` |
| `src/broker/service/index.ts` | `92bf268cc007ff44de577c6aa4bbdb6e70f7246d13b55eeb245788cdc38599f0` | `804f6b9504f9497253ff9108be932debd38dd6289535e1d1621f4844ab519561` |
| `src/broker/stream/hub.test.ts` | `88c427bb553268266d49905631b4b42bf0b48dd193ea16481838fc39984c5eff` | `45b02631e8e5ef9b8c2d0020c1c5923efe326c654ee84d5bf056944e3baabd42` |
| `src/broker/stream/hub.ts` | `238eef34d4cd71cf76a5b8429531a711d8f04e2e17623de3ac2da440669b3b0a` | `6efec0dd8f123cccd8060ecd0173d0b7ef0b8e501721b103cc00127ca240eb8e` |
| `src/broker/stream/mailbox/index.test.ts` | `ce98ddb37b0e2026f080ed9718c0e76644719387198fb4ead88e29596ec84ec1` | `850c72acff26dace61ec00e5c68815c612417cd589bdcfab7fefc141419e785d` |
| `src/broker/stream/mailbox/index.ts` | `fbb646efbc979e7a11ce6dcb738752a7cb155457e6443382b514d82720bfe2ad` | `baf544272d68abffd33f863ac5429cd6094e8225ae52d09abd80e5773c70371d` |
| `src/broker/stream/replay-buffer/index.test.ts` | `1ccadadebb45d6682405d775e7714c06339827984bae175d1920f92e77dadb6f` | `0394c0e15864d2e0b316eb96a42c50a687c86837eb3d34bf05a6e788603a5630` |
| `src/broker/stream/replay-buffer/index.ts` | `4eb044f2a782ff886228d99c7fa69234f14a12eec0c01dd33ceda009a2cf83ee` | `417b0e4270af60741aae59cb41f97e0938013925db3bea1dbe118eaed19b61ed` |
| `src/broker/transport/websocket.ts` | `416589e7950911c8be30b3353e22a644c470023fcc90eea767b1c6a13d1d35e4` | `6ff14ae8bdb00838562b8dacaa2c5dc3daf844db76af363da069b6bf939c0178` |
| `src/broker/worker/entry.ts` | `b0402cf57b172ef76eab8cd12eff2151e2954fa60d6cbc839a5e1de724ac51ba` | `8acf7106526831e9710e055f51ff4e402d1504de7a6170728916c9943d884f36` |
| `src/broker/worker/index.ts` | `7d15a9c5b65a1ba40e24fbfe3faba652966a0a2c0c7662b5c4c70eae2cda1cfc` | `49191da16e22981777416a67d989790d0566bd1e2479e70da83a9d68b2791c0c` |
| `src/broker/worker/inline.ts` | `50c4674fae3d87f08792cc0465bea42554948efdfa5a5f644dd8e4097854792f` | `a0925b0afa0b11d0e1087a1d53fb25fe01e32f28515ae118af36990f10af03a6` |
| `src/broker/worker/pool.test.ts` | `d3e94584e89a708d5fa0c4a0bd9e99032bb39e18f7899393b7395083b9385055` | `cb6ccbabc0144118c07c58cb3ad2f2312c4e4c889ceb41c058aa1df3e686e6b7` |
| `src/broker/worker/pool.ts` | `ab8ddf7172993d32edbd3dd13940c2279080193fed367a3df58f0485189e5e73` | `ecdfd199f919881f30244a053a72fcc43b8ee9d8e40f2f0c98a61783f7a014de` |
| `src/broker/worker/worker-exit-zero.fixture.mjs` | `22ecfd1f0976ec486cfba7d0f57a3752d62dca4c43835511fd4d600787478774` | `5551c1ea6e1aa6d5bfb5dc3d3e76f1d11a3b9691697804c7938c9a97402a5123` |
| `src/broker/worker/worker-hang.fixture.mjs` | `70cf0a48e3df082801faf0c49641a4bd84917c065a4372f5300fd2c61c7034ed` | `d654d4d413b5228dc8e42e6ab41fc1703de1ab0bb36c3ee012805b6d1da9a441` |
| `docs/api.md` | `fe2c9aa79d45449f352a682ca7201afef672fc1b7e97fab6f41123c9dad1ddd2` | `298c2e85edec5a4186f779be4a8cb88c631921d554110cf68753a1ba3bf2876e` |
| `docs/architecture.md` | `d5a8ed7dfad90b95412aa817e960accb5d77d126d9766ab80e39216a0dbf0a3d` | `dd2d949e4986d4dc2f21305808108f95e839123222218358267f459461d1ddb9` |
| `docs/constraints.md` | `e254ca9c7bdc24131c41c552ff95becd2ccab75b26e0e40717c5dd73f0a4b490` | `300cab890532271d493ccf3e2e41814af71f58713d55f87f6da5c9aa5617f516` |
| `docs/internals.md` | `6b432d625800cb5c2629bf865e74f87bedda26246c97459c40f7cb365214b5af` | `67dee2412cbaf718a8cf4b726838393a0d12fc8f50a4881a5d1ac88935cf8940` |
| `docs/overview.md` | `e41bc39247ecb1377ae946496a8b4bef3fba7ae509e7b4d91581a116b9bc4330` | `a1baf8e39e3ecd35f2c70a6b7e002ead6c6554daf58a60e0b12a74261ebbcbd3` |
| `docs/testing.md` | `f40e741a68050b0fe462f7cedaea9bc65aee9be749b361d55b78ee388908ed87` | `7bd502262784da76c20d5f2a6e5b84a7bc83a33e6ac159376700936a54d360f9` |
| `docs/usage.md` | `5405be4ddcfec4648b354ebab27747ad8629bafdff13de011fa55ccf8094f989` | `341803cd7d35f800a1dbf22e2a0a4b912c6f5c8f2f7b319f1f67ecbf86e0bc82` |
| `README.md` | `7a028da5e70d1ad8ffe7b49bd0ebea10044169c24cb098c81a71f7eb66b6da0c` | `278008e94bc61ad3c9d741568f3ec014726629000658f4d0a82e3a1064be69ee` |
| `tsconfig.json` | `91e1f7b5bbc091598ce4105676cad7096d69b75024deaec3085067475adf52dc` | `af39a06c246fc12775594c90b51ec8f1a15d88af85a972a6f7a8eee91fda8dfe` |
| `package.json` | `223f963b06f2f3c9f944539cb07bba19c2b1617e783bcac26f62715dac576424` | `06870904e7a1588573ecba218595d6f3c001e43890e558e2ea54d1de36909a1c` |

### P2 재동기화

1. 원본 repo·HEAD·dirty·LICENSE/SPDX와 대상 파일 byte hash를 새 manifest에 고정한다. `.env`·cache·dist·node_modules는 읽거나 복사하지 않는다.
2. source→issus diff를 경로별 검토하고 위 행별 패치를 새 source에 재적용한다. source metadata/immutable cursor/외부 tx API 계약을 후퇴시키지 않는다.
3. 원본+추가 unit/WS·실DB 회귀, lint/build/runtime export를 다시 실행한다. 설치/lock/compose는 P1 소유자에 요청한다.
4. 실제 로그·미검증 사유·69파일 source/final hash·파생 버전 변경을 이 P2 절과 manifest에 갱신하고 #1 VERIFY를 받는다.

시험 계획: [P2 계획](../packages/agent/tests/plans/agent-vendoring-20261021.md). 실행 보고: `packages/agent/tests/reports/agent-vendoring/`의 timestamp 파일. 로그: `.cache/p2/` 및 host `.cache/p2/orch-validation/`.

## scripts 출처와 변경

출처 `hikaMaeng/ndx_business`, 로컬 `F:/dev/ndx_business`, HEAD `d52c71e92493ec33584c09d679c789e15cf70086`. 복사 시각은 [byte manifest](vendoring-scripts.json)에 UTC로 고정한다. 네 script 모두 Git diff가 없던 작업 트리 byte를 읽어 복사했다. 원본은 수정하지 않았다. 루트 및 scripts 경로의 LICENSE/SPDX는 발견되지 않았다: **없음, 소유자 동일**. 외부 공개 배포 가능 여부: **미확인**.

| 원본→목적 | 원본 SHA-256 | 목적 SHA-256 |
| --- | --- | --- |
| `F:\dev\ndx_business\scripts\deploy.sh` → `scripts/deploy.sh` | `d230a72cee20eda541ba054cfa37480a2de3a71d11e10bbc0706868d6873b6f6` | `0519f0cb6a982ce18d47494a433d29f01d73de26b630d7bcb8c6a98c06cfe033` |
| `F:\dev\ndx_business\scripts\dependency-fingerprint.sh` → `scripts/dependency-fingerprint.sh` | `1d73c38cafc3989f30260da41f6c021c6f3bb2664a7072482f3293e93185e0d6` | `1d73c38cafc3989f30260da41f6c021c6f3bb2664a7072482f3293e93185e0d6` |
| `F:\dev\ndx_business\scripts\node-range.mjs` → `scripts/node-range.mjs` | `889803c1906f854909a7e6530c429bbb5e8889d9c6388620c5cb88001f51ca6d` | `889803c1906f854909a7e6530c429bbb5e8889d9c6388620c5cb88001f51ca6d` |
| `F:\dev\ndx_business\scripts\run-tests.mjs` → `scripts/run-tests.mjs` | `a0a59f61998ab32806e65b9577700ab6270695f766a04c7f0ad5aabb7a1f5b7d` | `22c1b169ce64a28658370164381fbd641d925c40ee3afe9b0867f455952c0b08` |

위 목적 hash와 byte manifest는 최초 P1 snapshot이다. 후속 scripts 변경은 아래 표로 구분한다.

| 후속 변경 | 이유·검증 |
| --- | --- |
| `deploy.sh` + `deploy-targets.mjs` (s2, RE:6308478318) | 부분 배포에서 `depends_on` 전이·동일 image 형제를 빌드 전에 폐쇄하고 Dockerfile 소유 app의 Turbo filter·compose build/up·health에 같은 대상 집합을 사용한다. dist 없는 의존 app/형제의 COPY 실패·오래된 배포를 막는다. `scripts/deploy-targets.test.mjs`로 전이·형제 재폐쇄·순환·실제 compose graph를 검증한다. |

deploy.sh: 인자 없음=전4서비스, `node-range.mjs` toolchain 검사 유지. Docker 접근 실패 시 즉시 종료(대체 CLI/context 우회 제거). env.defaults와 선택적 `.env` 사용, 기존 값 보존·신규 secret형 키 추가 금지. ISSUS_HOST_PORT/ISSUS_PORT/ISSUS_DB_HOST_PORT를 sample과 shell에서 검증·export. 외부 project 또는 service label 불일치 컨테이너는 소유자 표시 후 실패하며 삭제하지 않는다. host 포트 bind 충돌도 실패한다. local install fingerprint와 ^build를 재사용하고 의존 서비스·동일 image 형제의 폐쇄 집합을 local build·compose build/up --wait·health 검증에 사용한다. DB는 pgmq health로 판정하며 HTTP를 보내지 않는다. app 기본 health는 `/ready`. shared packages/dist·env·port hash를 current 판정에 포함하고, 성공 후에만 marker를 쓴다. 증거 JSON은 HEAD·dirty hash(tracked binary diff hash + 정렬된 untracked 경로/byte SHA-256의 JSON hash; gitignored 제외)·설정 hash·image ID/digest·bundle hash를 기록한다. 경로와 원문은 증거 JSON에 내보내지 않는다.

dependency-fingerprint.sh: 원본 byte를 유지한다. package/lock 및 모든 workspace manifest를 hash한다.

node-range.mjs: 원본 byte를 유지한다. comparator AND / `||` OR만 지원한다.

run-tests.mjs: `.test.ts/.tsx/.js/.mjs`를 수집한다. P1 placeholder만 명시적 `--allow-empty`로 tests=0을 허용한다. integration/browser는 빈 시험을 성공 처리하지 않는다. node --import tsx --test와 inherit stdio를 유지한다.

신규 보조 script: build-app.mjs(호스트 esbuild CLI node24 bundle+Vite front+manifest; 원본처럼 CLI를 inherit stdio로 실행), build-infra.mjs(SQL 검증+manifest), deploy-preflight.mjs(외부 컨테이너/포트 충돌 거부), deploy-evidence.mjs(비밀 원문 없는 hash 증거), types/infrastructure.d.ts(DB workspace lint용, 런타임 소스 아님). 출처 복사 대상은 아니며 P1 작성이다.

원본 dirty 관측(복사 대상은 없음):

```text
 M packages/vibeagent_domain/src/server/inference/llm/idle.test.ts
 M packages/vibeagent_domain/src/server/inference/llm/index.ts
?? .codex/
?? AGENTS.md
?? README.md
?? apps/admin/AGENTS.md
?? docs/api.md
?? docs/architecture.md
?? docs/constraints.md
?? docs/internals.md
?? docs/overview.md
?? docs/testing.md
?? docs/usage.md
?? pgview-run.mjs
?? tests/model-eval/
```

재동기화: 원본 HEAD/dirty/source byte hash를 다시 고정 → 네 script 변경 diff를 검토 → issus 변경 이유를 재적용 → npm 검증·compose config·외부 컨테이너 충돌/반복 배포를 다시 실행 → manifest 목적 hash와 보고 갱신. 원본 `.env`·token·node_modules·dist·cache는 읽거나 복사하지 않는다.

## registry 확인

확인 시각 `2026-10-21T04:40:35.853130+00:00`. 공식 registry `https://registry.npmjs.org/`의 package metadata `dist-tags.latest`와 해당 version의 engines/peerDependencies/integrity를 확인했다. @types/node는 런타임 24 major의 최신 stable을 골랐다. raw 확인 결과는 `.cache/p1/registry.json`이다. 재현 명령은 `npm view <name> dist-tags engines peerDependencies --json --registry https://registry.npmjs.org/` 및 `npm view @types/node@24 version --json --registry https://registry.npmjs.org/`이며 실제 조회는 Python urllib HTTPS GET으로 각 표의 metadata URL을 읽었다.

| 의존 | pin | 관측 latest | 공식 출처 |
| --- | --- | --- | --- |
| `typescript` | `7.0.2` | `7.0.2` | [metadata](https://registry.npmjs.org/typescript) |
| `turbo` | `2.11.10` | `2.11.10` | [metadata](https://registry.npmjs.org/turbo) |
| `vite` | `8.3.4` | `8.3.4` | [metadata](https://registry.npmjs.org/vite) |
| `react` | `19.3.1` | `19.3.1` | [metadata](https://registry.npmjs.org/react) |
| `react-dom` | `19.3.1` | `19.3.1` | [metadata](https://registry.npmjs.org/react-dom) |
| `express` | `5.3.0` | `5.3.0` | [metadata](https://registry.npmjs.org/express) |
| `esbuild` | `0.28.2` | `0.28.2` | [metadata](https://registry.npmjs.org/esbuild) |
| `tsx` | `4.23.15` | `4.23.15` | [metadata](https://registry.npmjs.org/tsx) |
| `env-schema` | `8.0.1` | `8.0.1` | [metadata](https://registry.npmjs.org/env-schema) |
| `@types/node` | `24.19.2` | `26.6.5` | [metadata](https://registry.npmjs.org/%40types%2Fnode) |
| `@types/react` | `19.3.0` | `19.3.0` | [metadata](https://registry.npmjs.org/%40types%2Freact) |
| `@types/react-dom` | `19.3.0` | `19.3.0` | [metadata](https://registry.npmjs.org/%40types%2Freact-dom) |
| `@types/express` | `5.0.6` | `5.0.6` | [metadata](https://registry.npmjs.org/%40types%2Fexpress) |

React DOM 19.3.1의 peer react ^19.3.1을 exact 19.3.1로 맞췄다. Vite 8.3.4 engines는 `^20.19.0 || >=22.12.0`이므로 root/workspace engines도 `>=20.19.0 <21 || >=22.12.0`로 기록했다. 실제 호스트는 Node v26.4.0/npm 11.17.0, 이미지 Node24·esbuild target node24와 분리한다. npm workspaces 지시를 우선해 pnpm lock과 pnpm 전용 shamefully-hoist 설정은 추가하지 않았다. npm cache는 sandbox에서 쓸 수 있는 `.cache/npm`이다. 내부 `@issus` scope는 `http://verdaccio.neurondev.net:4873`, 직접 registry 설치 대신 agent 로컬 슬롯을 쓴다.

## 이미지·포트·제외 범위

| 항목 | P1 기록 |
| --- | --- |
| Node base | `node:24-alpine`, digest 미확인(Docker daemon 접근 차단) |
| DB base | `ghcr.io/pgmq/pg18-pgmq:v1.10.0`, digest 미확인(동일 차단) |
| 포트 listener | netstat 착수 확인에서 18140·15440 매치 0; 기본 유지 |
| Docker 게시 포트 | daemon 차단으로 별도 확인 불가; deploy-preflight가 실제 배포 전 검사 |
| 배포 runtime | 미실시; Bash CreateFileMapping Win32 error 5, daemon permission denied |
| 빌드 runtime | 7/8 build 성공, Vite windowsSafeRealPathSync의 child_process pipe EPERM으로 front 차단. 설정·의존 소스 패치 없이 외부 재검증 요청 |
| 설치 구분 | 최초 정상 install은 esbuild postinstall EPERM. 진단용 npm install --ignore-scripts exit0 후 일반 npm install exit0(127 audit, 0 vulnerabilities). 깨끗한 install은 정상 권한에서 재검증 필요 |
| DB 인증 판단 | loopback 게시+internal network의 P1 골격은 trust. 운영 token/DB 인증·DATABASE_URL·migration·queue 준비는 P4 통합 시 교체 필요 |
| 제외 | 기존 secret·운영 데이터·외부 container 삭제·volume 삭제·prune·commit·push |

P1 최초 `/ready`는 골격 준비 응답이었다. 아래 P4 조립이 migration/DB/queue readiness를 연결한다. [최초 시험 보고](../tests/reports/scaffold/20261021_134000.md)와 현재 검증을 구분한다.

## P4 루트 조립 — issus-1-base/s3

DECISION `6309746634`, 요청 `.cache/requests/issus-1-core.md`. domain/server는 backend·intake, runtime/server는 config·auth·migrations·health를 공개한다. common/protocol/compact의 `CompactPublication`·`CompactPublicationInput`은 backend 정본의 타입만 재수출한다. runtime 직접 의존은 `pg 8.23.1`, `env-schema 8.0.1`; domain의 pg는 production dependency다. lock 재생성·호스트 npm install은 오케스트레이터 담당이다.

`scripts/build-app.mjs --server-only`도 domain dist의 `0001-domain-baseline.sql`을 app `dist/migrations/`로 복사하고 manifest/hash에 포함한다. broker entry는 이 파일을 읽어 `runMigrations({baselineSql})`에 주입한다. container에서 workspace 자산 resolve에 의존하지 않는다.

기동 순서: 환경 검증 → operator secret의 hash 계산 → schema lock 하 migration 0001/0002/0003·PGMQ queue/broker schema → bootstrap 설치 → `createEventBroker.start`. HTTP 조립 시 UoW/auth/health가 broker DB pool을 공유하고 초기화 pool은 닫는다. `ISSUS_ALLOWED_ORIGIN`을 runtime의 `ISSUS_ORIGIN` 입력으로 연결한다. 기존 secret 파일은 이 구현 세션에서 열람하지 않는다.

`RuntimeAuth`를 SessionVerifier로, `IntakeService.resolvePrincipal`에는 `auth.resolveActor`를 주입한다. `extendHttp`에 core router와 별도 `coreHttpError`를 설치해 앞선 agent JSON parser 오류까지 공통 응답으로 변환한다. `/ready`의 선행 agent route는 agent/s3 `ready` hook으로 `health.ready().ok`를 검사한다. initialized는 기동 성공 뒤 true, stop 시작 때 false다.

P5 연결 전에는 `allowedActions=[]`, `ingressQueues=[]`, reactions 미지정, 채널 읽기 거부다. subscription/receipt callbacks·canonical+inbox historyReader·worker `executeIngress(event,context.fence)`는 P5 인계 계약이며 이 세션은 P5/P6/P7 기능 파일을 편집하지 않는다. P4 기본 history는 `readIssueHistory`와 runtime 0003 snapshot이다.

동시 단계 요청: P5 domain routing/delivery/scheduling·runtime worker-bindings/scheduler-producer/adapters의 공개 barrel, P6 compact barrel·publication 주입·인증 뒤 compact HTTP, P7 front client/model barrel·CLI ws 8.22.0/@types/ws 8.18.2 exact를 연결한다. P6 `readCompactHistory`를 임시 canonical historyReader로 주입해 COMPACT 원문과 compactStatus를 분리한다(ASK 6309998199). P5 union reader가 이 경계를 인계하며 production reactions/callback/stream은 placeholder 유지 지시가 우선한다.

검증 경계: [계획](../tests/plans/core-wiring-20261021.md), `.cache/base-s3/*.log`. 실제 Postgres의 고유 schema로 bundle 기동·health/ready·auth·migration 누락 시 503을 검증하고 schema를 정리한다. fixture secret은 메모리 hash만 설치한다. Docker 전체 배포·운영 token mount·P5/P6/P7 통합·직접 node HOST binding은 별도 호스트 수용 대상이다.
