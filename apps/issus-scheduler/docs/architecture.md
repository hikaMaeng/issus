# architecture

createIssusScheduler는 createWorkerServer와 createSchedulerProducer를 combineServices로 조합한다. consumer는 worker frame의 pool, producer는 짧은 전용 pool을 소유한다. 시작은 consumer→producer, 종료는 producer→consumer→producer pool이다. ticker는 큐에 넣고 반환하며 ACK를 기다리지 않는다. Docker는 호스트 dist만 복사한다.
