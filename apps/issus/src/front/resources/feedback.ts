/** Shared layout and asynchronous state copy. */
export const feedbackKo = {
  skip: '본문으로 이동', currentRepo: '현재 저장소', selectRepo: '저장소를 선택해 주세요', openNavigation: '탐색 열기',
  closeNavigation: '탐색 닫기', context: '이슈 보조 정보', foldContext: '보조 정보 펼치기', board: '공통 게시판', roster: 'ROSTER',
  partial: '일부 기능을 준비 중입니다', unavailable: '이 화면은 다음 구현 단위에서 제공됩니다', retry: '다시 시도',
  workState: '작업 STATE', ownerAlias: '담당 별칭', participant: '참여 별칭', search: '이슈 검색', sort: '정렬',
  filters: '이슈 필터', numberDesc: '번호 내림차순', numberAsc: '번호 오름차순', titleAsc: '제목 오름차순', updated: '갱신 시각',
  q2: '서버 확장 조회 준비 전에는 담당·참여 별칭·갱신 시각 필터를 사용할 수 없습니다',
  q2Ready: '담당은 현재 OWNER, 참여는 댓글 FROM/TO/CC 정확 일치입니다. 검색은 제목 또는 정확한 이슈 번호입니다', pointers: 'COMPACT / BOARD',
  complete: (count: number) => `전체 페이지 조회 완료 · ${count}건`, matches: (count: number) => `조건에 맞는 이슈 ${count}건`,
  collecting: (count: number) => `목록을 모으는 중 · 조회 ${count}건`,
  repoCreate: '저장소 개설', slug: '저장소 이름', projectCode: '프로젝트 코드', autoBoard: '게시판 자동 생성', boardOwner: '게시판 담당 별칭',
  create: '개설', repoCreated: '저장소가 개설되었습니다', newIssue: '이슈 개설', absent: '없음', checkingOwner: '담당 이름 확인 중',
  selectedRepo: '선택한 저장소', source: '출처', information: '현재 페이지 정보', refreshPending: '갱신 중',
  claimHint: 'CLAIM 자원은 DUE 경과만으로 해제되지 않습니다. 원 이슈의 CLAIM과 RELEASE를 확인하세요',
  diagnostics: '서버 진단', bodyObservation: '이슈 본문 원문', activeHolds: '활성 HOLD', waitingAck: 'ACK 대기', openAsks: 'OPEN-ASK', claims: '미RELEASE CLAIM', handoff: 'HANDOFF', compactDue: 'COMPACT due', revision: '본문 revision',
} as const;
