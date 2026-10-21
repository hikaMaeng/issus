# 제약

DOM·React·node: import·파일 IO 없음. token은 요청 header만 만들고 scope/checkpoint/오류에 보관하지 않는다. TLS/인증 우회·WS mutation·자동 업무 ACK·application/process 호출 없음.

frame shape는 P3를 따르고 payload의 업무 검증은 서버/P3 action decoder 소유다. cursor는 server가 발급하는 opaque UUID다. 전송 수신을 처리 완료로 표시하지 않는다. 다른 stream sequence는 비교하지 않는다. onFrame/저장 실패는 terminal이고 receipt 전 실패한 event cursor는 전진시키지 않는다.
