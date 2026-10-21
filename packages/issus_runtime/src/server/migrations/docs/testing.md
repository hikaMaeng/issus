# 시험

`index.test.ts`는 실제 5s transaction_timeout을 SQL 사이에 발생시킨다. 시험용 Client 오류 listener 없이 프로세스 생존과 새 backend 교체를 확인한다. 별도 Pool로 자기 idle backend를 종료해 idle Pool 오류 처리·제거·새 query 성공도 확인한다. 공유 서비스·다른 backend는 종료하지 않는다.
