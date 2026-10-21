# usage

루트에서 `npm run build --workspace @issus/cli` 후 `npm exec --workspace @issus/cli -- issus --help`를 실행한다. 직접 실행은 `node apps/cli/dist/index.js --help`다. CLI는 compose 상주 서비스가 아니다.

workspace name/bin 변경 뒤 호스트에서 lock을 재생성하고 설치하여 Windows npm shim을 갱신해야 한다.
