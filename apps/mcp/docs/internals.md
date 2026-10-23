# 내부 상태

수신: STAGED → RECEIPTED → RETURNED. 업무 증거: ACK id·REPORT id·application·process를 별도로 저장한다.
직접 지시는 REPORT/application/process가 모두 확인되어야 resolved다. HANDOFF는 explicit acceptance도 필요하다. 정보는 process로 종결한다.

- snapshot마다 새 InboxModel을 만든다. snapshot 내부 nextCursor는 같은 인스턴스에 적용한다.
- snapshot 전체 완료·journal 저장 뒤 refreshCursor/versions를 함께 확정한다. partial 중단은 모델/nextCursor를 유지한다.
- 재시작은 partial pagination을 버리고 마지막 완료 refresh 또는 새 snapshot을 사용한다.
- versions는 deliveryId의 aliasEventSequence로 비교한다(BigInt). 이전 page가 상태를 후퇴시키지 않는다.
- 대기 큐·반환 이력은 모델 밖에 있다. 같은 delivery의 attempt/state 갱신은 새 작업이 아니다.
- sourceEventId·viewKey로 같은 원 사건을 합친다. canonical-only history에 delivery를 합성하지 않는다.
- HOLD → 직접 지시 → ordinal 순서로 반환한다. 자기 FROM은 journal에 표시 제외로 기록한다.
- receipt 전에 immutable comment/issue/COMPACT를 hydrate한다. 실패하면 receipt/return을 완료하지 않는다.
- 댓글 응답 schema 오류·조회404/410/422는 해당 delivery의 hydrationError(code/httpStatus/시각)만 journal에 저장해 후보에서 제외한다. refresh/restart로 다시 큐 선두에 넣지 않으며 상태는 미종결로 보존한다. status는 원 commentId/viewKey를 함께 반환한다.
- 비댓글 fact의 null/부재 commentId는 public InboxItem의 부재로 정규화한다. comment GET 없이 content/source로 패킷화하며 receipt와 process는 계속 별개다.
- 410/scope mismatch는 읽기 cursor만 복구한다. 처리 근거·미완료 업무 journal은 유지한다.
- sid/session 변경 시 cursor·versions를 버리고 alias 업무 journal을 승계한다.
- 재시작 미종결 항목은 recovery:true로 한 번 제시한다. processed cursor가 앞서도 ACK만으로 숨기지 않는다.

write identity는 principal session·path·method·body digest다. UUID key·원 revision·operationId만 저장한다. 미확정 요청은 원 key/revision으로 재관측한다. 최종4xx 뒤 수정은 새 key다.
파일은 임시 wx 생성→fsync→같은 볼륨 rename으로 교체한다. 저장 실패가 다음 효과보다 앞선다.
