# usage

루트 npm run deploy -- issus-worker가 dist 빌드 뒤 compose로 의존 서비스와 배포한다. DATABASE_URL과 검증된 PORT를 주입한다. 운영 큐 이름은 protocol/runtime QUEUES다. 테스트 schema/queueName/clock은 BindingOptions로만 격리한다. 앱 기본 entry는 공개 P6 applyCompactReaction·compactPublication을 연결한다. 하위 createWorkerBindings를 직접 쓰는 구성자는 같은 callback을 주입하며, 하위 binding의 미주입 compact는 no-op이다.
