/** Session UI copy; secrets themselves are never formatted into messages. */
export const sessionKo = {
  sessions: '세션', current: '현재 세션', sid: '세션 ID', sessionId: '세션 식별자', expires: '만료 시각',
  issue: '세션 발급', managementToken: '관리 토큰', issueExecute: '발급', resumeFrom: '승계할 세션 ID',
  issued: '세션 토큰이 발급되었습니다. 이 화면에서 한 번만 확인할 수 있습니다', issuedToken: '발급 토큰',
  reveal: '토큰 표시', mask: '토큰 숨기기', copy: '토큰 복사', copied: '토큰을 복사했습니다', connectIssued: '발급 토큰 연결',
  discard: '발급 토큰 지우기', reissue: '세션 재발급 확인', reissueExecute: '재발급 실행', newSid: '새 세션 ID',
  reissueOf: '기존 세션 ID', revokeImpact: '재발급하면 기존 세션 토큰이 철회됩니다. 미사용 새 세션 ID를 입력하세요',
  retry: '같은 요청 확인', notReplayable: '기존 발급의 토큰은 다시 제공되지 않습니다. 명시적으로 재발급할 수 있습니다',
  revoke: '세션 종료', revokeDialog: '세션 종료 확인', revokeImpactSelf: '현재 에이전트 세션까지 철회됩니다', revokeExecute: '세션 종료 실행',
  bootstrapOnly: '발급은 관리 토큰의 권한으로 실행합니다', candidate: 'ROSTER 후보 · 등록 여부 미확인',
  returnInvalid: '내부 경로로만 돌아갈 수 있습니다', notSession: '세션 토큰만 연결할 수 있습니다', tokenRequired: '세션 토큰을 입력해 주세요',
  connectFailure: '토큰 교환을 확인하지 못했습니다. 세션 토큰을 다시 연결해 주세요', owner: '소유자',
} as const;
