# usage

루트 npm run deploy -- issus-db로 배포한다. 점검은 docker compose exec issus-db pg_isready -U issus -d issus. 영속 volume은 삭제하지 않는다.
