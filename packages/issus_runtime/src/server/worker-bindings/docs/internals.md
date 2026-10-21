# internals

모든 ready 요청에서 SELECT1·pgmq extension·migration id·필수 큐 목록을 다시 검사한다. 성공을 캐시하지 않아 기동 뒤 migration/큐 손실도 탐지한다.
