# 제약

SQL identifier는 소문자 영문·숫자·밑줄만 허용한다. 이미 적용한 migration SQL을 바꾸면 checksum mismatch다. Pool listener는 프로세스 비정상 종료를 막으며 DB 작업 성공으로 간주하지 않는다. 5s UoW 제한과 worker 재시도 정책은 변경하지 않는다.
