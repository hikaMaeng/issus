# 사용

DB URL을 명시하고, 고립 시험에는 broker schema도 전달한다. Client를 직접 checkout한 호출자는 반드시 finally에서 release한다. 오류로 사용할 수 없는 Client는 release(true)로 폐기한다. 운영 코드에는 시험 URL·schema를 고정하지 않는다.
