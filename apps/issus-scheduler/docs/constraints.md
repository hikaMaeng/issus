# constraints

ticker 간격은5초 고정이다. slot 고유키와 DB advisory transaction lock으로 producer 중복/재시작을 막는다. due 선택은≤100이며 lookback 제한 없이 오래된 pending을 회수한다. 자동 재전달은 attempt3까지, 이후15분 정보성digest이며 미응답을 동의로 처리하지 않는다. agent worker readiness hook 연결 전 DB 단절시/ready 검증은 미완료다.
