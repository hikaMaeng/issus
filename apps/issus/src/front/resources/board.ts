/** U2 board copy. */
export const boardKo = {
  title: '공통 게시판', discovery: '게시판 발견 근거', via: '발견 경로', evidence: '근거',
  template: '게시판 NOTE 템플릿', reply: '원 이슈(REPLY-IN)', report: '원 이슈 최종 REPORT ID',
  result: '결과 1줄', lessons: '실패·교훈(최대 3줄)', artifacts: '재사용 산출물 경로',
  make: 'NOTE 초안 만들기', required: '결과·교훈·산출물·REPORT와 REPLY-IN을 확인한 뒤 게시하세요.',
  missing: '열린 게시판이 없습니다', conflict: '게시판 포인터가 충돌하거나 게시판이 닫혔습니다',
  ensure: '게시판 개설', owner: '게시판 OWNER', admin: '게시판 개설은 bootstrap 권한이 필요합니다.',
  success: '게시판을 확인했습니다', coordination: '작업 조율은 주제 이슈에서 진행하세요. 게시판은 NOTE·ACK·ALIAS·COMPACT만 허용합니다.',
  reopen: '기존 게시판 열기 · OWNER 또는 관리 세션으로 사유·STATE를 확인한 뒤 같은 게시판을 재개하세요.',
  note: ({result, lessons, artifacts, report}: {result: string; lessons: string; artifacts: string; report: string}) => `완료 공유: ${result}\n실패·교훈: ${lessons}\n재사용 산출물: ${artifacts}\n---\n원이슈 최종 REPORT ${report}`,
} as const;
