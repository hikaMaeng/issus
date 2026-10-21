# internals

시작 또는 성공 전·종료 후 ready는 reject한다. 첫 실행은 owner/동일 슬롯이 없어도 DB 왕복 성공이면 준비로 본다. 오류를 onError로 전달한 뒤 다음 5초 슬롯에서 회복한다.
