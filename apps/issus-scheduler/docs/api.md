# api

createIssusScheduler(BindingOptions, env)는 Service(start/stop)를 반환한다. tickRole(bindings)는 issus.clock.tick을 TickService.tick(slot)로, queued/acked/superseded 반응을 DeadlineService.react(source3)로 전달한다. produceTick(options)는 해당 UTC5초slot을 최초 발행하면true, 경합/중복이면false다. /health·/ready·운영 metrics는 agent frame 소유다.
