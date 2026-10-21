/** Korean copy and accessible names shared by views and feedback. */
export const ko = {
  app: 'issus', navigation: '주 탐색', repos: '저장소', issues: '이슈 목록', inbox: '받은편지함',
  loading: '불러오는 중', empty: '표시할 항목이 없습니다', refresh: '새로고침', more: '더 보기',
  connection: '세션 연결', token: '세션 토큰', connect: '연결', connected: '세션이 연결되었습니다',
  authRequired: '세션 토큰을 연결해 주세요', rootMissing: '화면을 표시할 요소가 없습니다',
  current: '이슈 현재 상태', comments: '댓글', raw: '원문 보기', summary: '구간 요약',
  noenv: '[NOENV] 봉투가 없어 실행할 수 없습니다', all: '전체 댓글 보기', since: '최신 COMPACT 이후 보기',
  beforeCompact: 'COMPACT 이전 댓글', body: '본문', state: '상태', owner: '담당', title: '제목',
  number: '번호', open: '열림', closed: '닫힘', filter: '이슈 상태', any: '전체',
  composer: '댓글 작성', commentBody: '댓글 본문', validate: '검사', post: '게시', valid: '검사를 통과했습니다',
  ack: '수신 확인 작성', ignore: '무시 사유 기록', ackDialog: '수신 확인 미리보기', ignoreDialog: '무시 사유 확인',
  preview: '게시할 ACK를 확인한 뒤 실행하세요', ackExecute: 'ACK 게시', cancel: '취소',
  ignoreReason: '무시 사유', ignoreExecute: '사유 기록', ignored: '무시 사유를 기록했습니다',
  directiveIgnore: '지시성 전달은 무시할 수 없습니다', invalidAck: '이 전달에는 ACK를 작성할 댓글 정보가 없습니다',
  ackContent: '수신 확인했습니다.', ackNext: 'NEXT: 지시 확인 후 처리 근거를 보고합니다.',
  overdue: 'ACK-BY 경과', deadline: 'ACK-BY', attempt: '전달 시도', alias: '별칭', repo: '저장소(owner/repo)',
  issueNumbers: '이슈 번호(쉼표 구분)', applyFilter: '조회', pending: 'PENDING-ACK', globalPending: 'PENDING-ACK-GLOBAL',
  unknownDate: '작성 시각을 확인할 수 없습니다', close: '이슈 닫기', closeDialog: '이슈 닫기 확인',
  closeExecute: '닫기 실행', closeReason: '닫기 사유', finalReport: '최종 REPORT id', closedSuccess: '이슈가 닫혔습니다',
  notFound: '페이지를 찾을 수 없습니다', failure: '요청을 처리하지 못했습니다', cycle: '페이지 커서가 반복되었습니다',
  sessionWrite: '댓글 작성에는 별칭 세션 연결이 필요합니다', streamConnecting: '실시간 연결 중',
  streamConnected: '실시간 연결됨', streamRetry: '실시간 재연결 대기 중', streamFailed: '실시간 연결 오류',
  csrfMissing: '쓰기 전에 세션 토큰을 다시 연결해 주세요', statusFilter: {open: '열림', closed: '닫힘', all: '전체'},
  operationPending: (id: string) => `처리 대기 중: ${id}. 같은 본문으로 재시도하면 기존 요청을 확인합니다.`,
  comment: (id: string) => `댓글 ${id}`, posted: (id: string) => `댓글 ${id} 게시됨`,
  issueTitle: (number: number, title: string) => `#${number} ${title}`,
  delivery: (id: string) => `전달 ${id}`, error: (code: string) => `요청 오류: ${code}`,
} as const;

/** Protocol states remain visible verbatim; these are durable resource values. */
export const deliveryLabels = {posted: 'posted', delivered: 'delivered', acked: 'acked', applied: 'applied', superseded: 'superseded'} as const;
