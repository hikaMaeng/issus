# constraints

manifest·top-level front export는 P1 소유다. P7은 `apps/cli`(manifest 제외)와 domain `src/front`(최상위 index 제외)를 수정한다. 신규 dep는 exact 버전으로 P1에게 요청한다.

토큰 우선순위는 명시 `--token-file` → `ISSUS_TOKEN` → selected profile. URL은 `--server` → `ISSUS_URL` → `ISSUS_SERVER_URL` → profile. env token은 profile의 alias를 신뢰하지 않고 `/auth/me`로 확인한다. stored token은 다른 서버 URL로 재사용하지 않는다. TLS 검증을 끄지 않고 redirect를 따라가지 않는다.

profile secret은 Windows DACL/그 외 mode0600 설정 후 내용을 기록하고 rename한다. 권한 실패는2, stdout token fallback은 없다. 기존 실제 secret 파일을 시험 fixture로 읽지 않는다. journal에는 body·bearer를 저장하지 않는다. 실제 게시의 UTF-8 원문/CRLF/BOM은 보존 검증하고 생성 파일만 LF로 저장한다.

watch me/mine 관찰 집합에는 token alias가 포함되어야 한다. 추가 별칭 접근은 서버가 검증한다. subscribe me는 token alias 또는 정확한 alias/sid 1개다. receipt는 사용자 ACK·application·process를 대신하지 않는다. nonTTY 미처리 delivery/지시가 남고 처리 증거가 없으면3, peek는0이다.

GitHub URL은 unsupported source다. 서버 레지스트리 조회가 Python의 GitHub search 단계를 대체하며 alias/board의 핵심 출력 형태만 유지한다. native watch는 Python과 달리 기본 since-compact=true, pending 우선·global pending 추가다. DOM/브라우저 markup은 P8 소유로 P7에는 없다.
