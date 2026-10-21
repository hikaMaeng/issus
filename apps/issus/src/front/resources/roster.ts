/** ROSTER and alias administration labels. */
export const rosterKo = {
  roster: 'ROSTER', registry: '별칭 레지스트리', bodySource: (revision: number) => `이슈 본문 ROSTER · revision ${revision}`,
  principalSource: '현재 principal', checkSource: '최근 별칭 검사 응답', registeredSource: '최근 별칭 등록 응답', renamedSource: '최근 별칭 개명 응답',
  partial: '레지스트리 읽기 준비 전 부분 목록입니다. 등록 전체 목록이 아닙니다', registrySource: '등록 레지스트리',
  role: '역할', model: '모델', scope: '범위', check: '별칭 충돌 검사', executeCheck: '별칭 검사', deep: '자세히 검사',
  available: '등록 가능성 검사 결과: 충돌 없음. 예약·세션 사용 권한을 뜻하지 않습니다', collision: '별칭 충돌', evidence: '근거', kind: '종류',
  register: '별칭 등록', rename: '별칭 개명', executeRegister: '등록', executeRename: '개명', newName: '새 별칭', aliasId: '별칭 식별자',
  repos: '저장소 ID(쉼표 구분)', announcement: 'ALIAS 공지 원문', announcementIssue: '공지 이슈 번호', announcementRepo: '공지 저장소 ID',
  tombstone: '이전 별칭은 tombstone으로 남으며 과거 댓글은 바뀌지 않습니다', registered: '별칭이 등록되었습니다', renamed: '별칭이 개명되었습니다',
  issue: 'ROSTER 이슈 번호', noIssue: '이슈 번호를 선택하면 본문 ROSTER 출처를 읽습니다', unconfirmed: '등록 여부 미확인',
  registrySearch: '레지스트리 검색', aliasDetail: '별칭 상세', openClaims: '미RELEASE CLAIM 수', recentIssues: '최근 활동 이슈',
  registeredAt: '등록 시각', renamedFrom: '이전 별칭', status: '등록 상태', renamedTo: '개명 대상', registryLoading: '등록 레지스트리를 읽는 중입니다',
  detailName: (alias: string) => `별칭 상세 ${alias}`,
} as const;
