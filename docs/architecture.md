# 구조

[설계](design.md) §9의 apps/packages 경계를 따른다. [요구](brief.md) 5에 따라 root compose 하나에 issus-db/issus/issus-worker/issus-scheduler를 조립하며 issus_internal은 internal이다. Docker는 node24 대상의 self-contained dist만 복사한다. agent는 P2가 인수할 4파일 빈 슬롯이다.
