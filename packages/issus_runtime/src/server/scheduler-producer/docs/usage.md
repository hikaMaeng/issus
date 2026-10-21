# usage

scheduler는 consumer 시작 후 producer.start, 종료는 producer.stop 후 worker.stop 순서다. 오류 로그는 onError에서 고정 event명만 기록한다.
