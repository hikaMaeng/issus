# usage

루트 npm run deploy -- issus-scheduler. DATABASE_URL·PORT를 검증 후 사용한다. 운영은 schema issus/issus_schedule, 시험은 schema/queueName/Clock을 명시 주입한다. producer 오류 로그는 event:scheduler.producer.failed만 기록하며 접속 문자열·댓글·token은 출력하지 않는다.
