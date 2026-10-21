# 워커 바인딩·깨우기 어댑터

`createWorkerBindings(pool,options)`는 주입받은 단일 pool로 P4 UoW/auth/intake와 P5 라우팅·delivery·inbox·deadline·retry·tick 서비스를 만든다. `BindingOptions`의 schema/queueName/clock은 격리 시험용이고 reactions는 앱 반응표를 주입할 때 사용한다. `compactReaction(tx,input)`과 `publication`은 P6 주입점이다. 미주입 compact 역할은 no-op이며 실제 COMPACT 처리를 완료했다고 보고하지 않는다.

반응표는 apps/issus의 유일 정본이다. 기본 worker는 fact를 append한 뒤 broker의 영속 log→reaction enqueue를 통해 이어진다. 구성자가 같은 반응표를 UoW에 주입하면 append+queue도 한 tx로 처리한다. 두 경로가 겹쳐도 source/projection·natural delivery key가 중복을 제거한다. 형제 앱 소스를 라이브러리에 import하지 않는다.

`produceTick({pool,schema,queueName,clock})`는 DB advisory transaction lock+schedule의 UTC5초 slot 고유키로 producer 중복/재시작을 막는다. `createSchedulerProducer`는 중첩 실행 없이5초마다 큐에 짧은 tick만 넣는다. ACK를 기다리지 않고 due 스캔은 scheduler 역할이 처리한다.

| factory | 관리자 입력·보장 | 실제 연결 검증 |
| --- | --- | --- |
| disabledWakeAdapter | 기본 off, 부작용 없이 accepted:false | 로컬 시험 |
| createWebhookAdapter | alias→고정 URL, allowedOrigins, 고정 headers. redirect:error,5초 timeout, Idempotency-Key. 응답 본문 폐기 | 미검증 |
| createCommandAdapter | alias→절대 실행 파일+고정 argv. shell:false, windowsHide,5초 timeout, stdout/stderr 폐기. 입력은 stdin JSON | 미검증 |
| createClaudeRemoteTriggerAdapter | 주입된 client.trigger, 없으면 off.5초 AbortSignal | 미검증 |

wire는 `issus_domain/common`의 WakeInput/WakeAdapter다. 댓글 본문에서 URL·실행 파일·shell을 만들지 않는다. 외부2xx/exit0/accepted는 delivered·ACK·applied가 아니다. 운영 entry의 기본은 disabled이며 외부 연결은 관리자 명시 주입 후 별도 검증한다. secret·응답 원문을 event/log에 넣지 않는다.
