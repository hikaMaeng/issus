# internals

기능 폴더 내부 구현을 루트 조립 entry에서 연결한다.

명령은 최초202 operation을 영속시킨다. `Prefer:wait=5`일 때만 같은 operation을 최대5초 기다린다. 대기가 끝나도 새 key로 재제출하지 않는다. 같은 principal/key의 원 결과는 동시 요청도 공유한다. 세션 발급만 token 없는409 재시도 예외다.

preflight는 issue 문맥·서버 Clock·metadata·권한을 실제 게시와 같은 함수로 검사한다. packet 생성·감사 event·due 저장·cursor·command_result·PGMQ 쓰기가 없다. body 모드는 실제 PATCH와 동일한 If-Match를 요구한다. 성공 뒤의 동시 변경은 worker가 다시 검사한다.

실제 test app은 loopback의 OS 할당 포트를 사용하고 고유 domain/broker schema와 큐 접두사만 생성한다. 운영 listener 범위10000–59999 계약과 시험 임시 listener를 구별한다. 워커 fault 시험은 별도 Node 프로세스를 read 직후/commit 전/commit 후에 종료하고 같은 DB 큐로 회복한다.

P6 prepare는 새 queue action 없이 P4 UoW/reserveCommand/finishCommand 제어 tx를 재사용한다. command_result에는 packetId/status만 저장하고 원 token은 random operation/packet UUID로 복원한다. 게시 자체는 P4 intake와 publication hook을 거친다.
