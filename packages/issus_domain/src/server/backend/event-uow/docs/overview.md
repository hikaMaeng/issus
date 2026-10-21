# 목적

projection·fact append·반응 큐 send를 같은 Client로 커밋한다. 활성 Client의 비동기 FATAL 오류를 처리하며 worker 프로세스를 살려 원 명령을 재시도한다.
