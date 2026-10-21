# 조립

`runMigrations`는 pinned Client와 schema advisory lock으로 순서를 직렬화한다. `createRuntimePool`은 연결 생성 시 Client error listener를 설치하고 Pool의 idle error도 처리한다. UoW가 활성 트랜잭션 오류 원인·연결 반납·재시도를 소유한다.
