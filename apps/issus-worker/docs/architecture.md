# architecture

entry의 createIssusWorker가 createWorkerServer(executeWith)로 기동한다. pool은 frame이 소유하며 역할별 서비스는 같은 pool을 주입받는다. workerExecute는 queue 이름으로만 역할을 고르고 각 역할은 source fact/command를 검증한다. 도메인이 다음 worker를 직접 호출하지 않는다. 반응표는 apps/issus/src/server/reactions/table 단일 정본이다. 기본은 broker의 영속 log→reaction enqueue, 주입 reactions가 있으면 도메인 append+send도 같은 tx다. 중복은 projection/natural key가 제거한다. Docker는 호스트 dist만 복사한다.
