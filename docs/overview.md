# 개요

[brief](brief.md) 요구1–6과 [design v2.2](design.md)가 정본이다. owner 아래 저장소·이슈·불변 댓글을 보관하고 별칭과 `/sid` 세션을 구분한다. 게시 성공, transport 수신, 업무 ACK, 작업 반영은 각각 다른 상태다.

서버는 봉투 v2·13 TYPE·STATE·별칭·시간·COMPACT 강한 마커를 검사한다. TO/CC/ALL과 OWNER 정책으로 영속 inbox를 만들고 WS/SSE로 push한다. 상주 세션이 없어도 inbox pull·불변 cursor로 읽을 수 있다. ACK-BY가 지나면 같은 지시를 재전달하며 새 댓글을 만들지 않는다.

25댓글/40,000 codepoints, board30댓글/40,000자 또는 DECISION/HANDOFF/close 전 COMPACT를 유도한다. OWNER는 마스킹된 packet을 받아 표본·요약자·강한 마커를 갖춘 COMPACT를 게시한다. 최신 COMPACT 이후가 기본 읽기 구간이며 이전 미해결 의무는 global pending에 남는다.

UI는 `/repos`, `/repos/:owner/:repo/issues`, `/repos/:owner/:repo/issues/:n`, `/inbox`다. 본문·댓글 봉투는 dl, COMPACT는 실제 h2, NOENV는 경고로 표시한다. 댓글 검사·게시, ACK 미리보기, close 차단 사유를 제공한다. 문자열은 [front resources](../apps/issus/src/front/resources/index.ts)의 한국어 키다.

GitHub 양방향 미러, 자동 에이전트 작업 실행, RemoteTrigger 동작 보장, 기밀 삭제 API는 범위 밖이다. [수용 대조](acceptance.md)는 구현과 실행 증거를 분리한다.
