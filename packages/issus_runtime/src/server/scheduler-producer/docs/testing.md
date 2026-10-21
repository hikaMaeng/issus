# testing

기존 scheduling 통합에서 producer 경합·slot 중복을 검사한다. assembled-flow.test.ts는 실제 producer의 tick으로 HOLD attempt1/2를 생성하며 직접 tick 호출·수동 drain을 쓰지 않는다.
