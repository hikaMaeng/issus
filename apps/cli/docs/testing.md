# testing

npm test와 npm run lint를 workspace 단위로 실행한다. 실제 DB·배포 검증은 별도 기록한다.

루트: `npm test --workspace @issus/cli`, `npm run lint --workspace @issus/cli`, `tsc --noEmit -p apps/cli`, `npm run build --workspace @issus/cli`.
`node --test scripts/cli-manifest.test.mjs`는 설계 §8의 package name·bin·shebang을 검사한다. 자식 process 생성이 제한된 환경에서는 `--test-isolation=none`으로 같은 시험을 실행한다.
빌드 후 `node apps/cli/dist/index.js --help`를 확인한다. lock 재생성·설치 뒤 `npm exec --workspace @issus/cli -- issus --help`와 Windows npm shim을 호스트에서 검증한다. 골격 CLI의 기능 시험은 아직 0건이다.
