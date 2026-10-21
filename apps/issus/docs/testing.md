# testing

npm test와 npm run lint를 workspace 단위로 실행한다. 실제 DB·배포 검증은 별도 기록한다. UI는 main 랜드마크 1개와 이름 issus인 level-1 heading을 노출한다. getByRole(main), getByRole(heading, {name: issus, level: 1})를 사용한다.
