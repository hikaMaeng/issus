# 내부 계약

`header`는 `{values, _type, _from, _to, _cc, _re, _sup, _first, _noenv}`다. `values`는 원 봉투 키를 보존하고 underscore 필드는 watcher 정규화 값이다. TYPE 레거시 mapping과 첫 값 우선 중복 처리는 정본대로다.

`pendingLegacy`는 입력 구간에 대한 순수 집합 연산이다. COMMENT·COMPACT를 삭제하지 않는다. `ackState`의 superseded/applied projection 필드는 이미 서버가 권한/근거를 확인했다는 입력 계약이며 이 함수가 권한을 부여하지 않는다. 최초 직접 ACK는 comment bigint 순서로 고정한다.

`transitionDelivery`는 posted/delivered→acked→applied, posted/delivered→superseded만 허용한다. 뒤늦은 receipt/retry는 상태를 후퇴시키지 않는다. posted→acked는 `ackEvidenceReceipt:true`를 반환해 `transport:ack-evidence`를 저장하게 한다. 정보성 delivery는 ACK/apply를 거부한다. 재전달 eligibility는 ackState가 아닌 별도 global legacy pending이다.

`compactDue`는 25댓글/40000자, board30댓글/40000자 및 before-* 사유를 계산한다. generation별 1회 fact·reaction dedupe는 projection/UoW가 책임진다. `mask`는 pem→github-token→aws-key→api-key→bearer→password→email 순서이며 전체 패킷의 최종 1회 치환 수를 반환한다.

정본 regex의 `\s`, `\b`, re.I 차이는 좁은 `pythonRegex` 변환기로 맞춘다. Python re의 decimal/word 및 str.isdigit 범위는 Python 3.13 Unicode 15.1.0 표에서 고정하여 Node의 새 Unicode 문자 추가에 따라 변하지 않는다. 공개 regex 상수의 source line은 constants 주석, Python source hash는 manifest에 있다.

SQL에서 scope는 중복 owner_id+composite FK로 제한한다. comment_counter는 singleton row를 잠그고 같은 tx에서 +1한다. 댓글 중복 hash는 후보 인덱스일 뿐이며 issue lock 아래 실제 bytes 비교가 필요하다. packet0 through는 FK용 NULL generated column으로 표현한다. 도메인→public broker FK는 baseline에 넣지 않는다.
