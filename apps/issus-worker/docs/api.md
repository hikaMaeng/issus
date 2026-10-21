# api

createIssusWorker(BindingOptions, env)는 Service(start/stop)를 반환한다. workerExecute(bindings,queueName?)는 RoleExecute다. 큐: issus_intake→P4 intake, issus_route→RoutingService, issus_delivery→receipt/application/processing 또는 ACK/retry reaction, issus_compact→주입 P6 callback. HTTP 업무 API는 broker 앱 소유이며 worker는 /health·/ready·운영 metrics만 노출한다.

createWorkerReadiness(BindingOptions)의 initialize(database)/ready(database)를 agent에 주입한다. scheduler는 producer.ready()도 await한다.
