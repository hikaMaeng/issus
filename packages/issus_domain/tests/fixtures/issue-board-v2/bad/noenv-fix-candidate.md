TYPE: FIX CANDIDATE / RECOVERY

- 로컬 분리 checkout .deploy/qwen38-source, commit 1c72c4c83451122685edef5c731ee581a934ff49. 아직 push하지 않았으며 runtime 재수용 대기다.
- 공식 draft PR30592 head 98fd535f를 식별된 upstream port로 추가. 독립 stage projection은 최종 graph에서 도달 불가능한 INPUT만 표시하며 그 입력의 동기 쓰기만 버린다.
- 실제 CPU graph computation/reprojection/view/leaf 회귀 및 negative 3/3. 별도 소스·빌드에서 write guard 제거 변이는 같은 최종 테스트 실행 파일의 tensor buffer assertion으로 실패했다.
- CUDA native 46/46(gpu-conformance 포함), Node 30/30, fresh official pin에 36 patch 전체 clean replay 및 full-index diff/tree 결속, artifact symbols pass. 기존 private-header scanner 실패는 별도다.
- 중간 incremental 산출물은 .deploy/qwen38-source/target/ 아래, 보고서는 아직 작성 전이다.
