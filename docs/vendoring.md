# Vendoring

## agent 이관 필수 기록 (P2 작성)

동일 소유자 사설 이관 허용 근거: DECISION 6307832679 Q2. 외부 공개 배포 가능 여부: **미확인**. 임의 라이선스를 부여하지 않는다.

| 필수 항목 (설계 §1.1) | agent 값 / 담당 |
| --- | --- |
| 출처 repo·로컬 경로 | P2 작성 |
| HEAD | P2 작성 |
| 관측 dirty 목록 | P2 작성 |
| 복사 시각 | P2 작성 |
| 원본→목적 경로 | P2 작성 |
| 파일별 SHA-256 | P2 작성 |
| 라이선스 확인 결과 | P2가 LICENSE/SPDX 확인 후 작성; 없으면 `없음, 소유자 동일` |
| 제외 목록 | P2 작성 |
| 패치별 이유·시험 | P2 작성 |
| 파생 버전 | `0.1.0-issus.1` 예약, 실제 vendoring P2 |
| 재동기화 절차 | P2 작성 |
| registry 확인 명령·결과 | P2 작성 |
| image tag+digest | P2 작성; P1 Docker 차단은 아래 별도 기록 |
| 공개 배포 가능 여부 | 미확인 |

## scripts 출처와 변경

출처 `hikaMaeng/ndx_business`, 로컬 `F:/dev/ndx_business`, HEAD `d52c71e92493ec33584c09d679c789e15cf70086`. 복사 시각은 [byte manifest](vendoring-scripts.json)에 UTC로 고정한다. 네 script 모두 Git diff가 없던 작업 트리 byte를 읽어 복사했다. 원본은 수정하지 않았다. 루트 및 scripts 경로의 LICENSE/SPDX는 발견되지 않았다: **없음, 소유자 동일**. 외부 공개 배포 가능 여부: **미확인**.

| 원본→목적 | 원본 SHA-256 | 목적 SHA-256 |
| --- | --- | --- |
| `F:\dev\ndx_business\scripts\deploy.sh` → `scripts/deploy.sh` | `d230a72cee20eda541ba054cfa37480a2de3a71d11e10bbc0706868d6873b6f6` | `0519f0cb6a982ce18d47494a433d29f01d73de26b630d7bcb8c6a98c06cfe033` |
| `F:\dev\ndx_business\scripts\dependency-fingerprint.sh` → `scripts/dependency-fingerprint.sh` | `1d73c38cafc3989f30260da41f6c021c6f3bb2664a7072482f3293e93185e0d6` | `1d73c38cafc3989f30260da41f6c021c6f3bb2664a7072482f3293e93185e0d6` |
| `F:\dev\ndx_business\scripts\node-range.mjs` → `scripts/node-range.mjs` | `889803c1906f854909a7e6530c429bbb5e8889d9c6388620c5cb88001f51ca6d` | `889803c1906f854909a7e6530c429bbb5e8889d9c6388620c5cb88001f51ca6d` |
| `F:\dev\ndx_business\scripts\run-tests.mjs` → `scripts/run-tests.mjs` | `a0a59f61998ab32806e65b9577700ab6270695f766a04c7f0ad5aabb7a1f5b7d` | `22c1b169ce64a28658370164381fbd641d925c40ee3afe9b0867f455952c0b08` |

deploy.sh: 인자 없음=전4서비스, `node-range.mjs` toolchain 검사 유지. Docker 접근 실패 시 즉시 종료(대체 CLI/context 우회 제거). env.defaults와 선택적 `.env` 사용, 기존 값 보존·신규 secret형 키 추가 금지. ISSUS_HOST_PORT/ISSUS_PORT/ISSUS_DB_HOST_PORT를 sample과 shell에서 검증·export. 외부 project 또는 service label 불일치 컨테이너는 소유자 표시 후 실패하며 삭제하지 않는다. host 포트 bind 충돌도 실패한다. local install fingerprint와 ^build를 재사용하고 의존 서비스까지 compose build/up --wait로 처리한다. DB는 pgmq health로 판정하며 HTTP를 보내지 않는다. app 기본 health는 `/ready`. shared packages/dist·env·port hash를 current 판정에 포함하고, 성공 후에만 marker를 쓴다. 증거 JSON은 HEAD·dirty diff hash·설정 hash·image ID/digest·bundle hash를 기록한다.

dependency-fingerprint.sh: 원본 byte를 유지한다. package/lock 및 모든 workspace manifest를 hash한다.

node-range.mjs: 원본 byte를 유지한다. comparator AND / `||` OR만 지원한다.

run-tests.mjs: `.test.ts/.tsx/.js/.mjs`를 수집한다. P1 placeholder만 명시적 `--allow-empty`로 tests=0을 허용한다. integration/browser는 빈 시험을 성공 처리하지 않는다. node --import tsx --test와 inherit stdio를 유지한다.

신규 보조 script: build-app.mjs(호스트 esbuild CLI node24 bundle+Vite front+manifest; 원본처럼 CLI를 inherit stdio로 실행), build-infra.mjs(SQL 검증+manifest), deploy-preflight.mjs(외부 컨테이너/포트 충돌 거부), deploy-evidence.mjs(비밀 원문 없는 hash 증거), types/infrastructure.d.ts(DB workspace lint용, 런타임 소스 아님). 출처 복사 대상은 아니며 P1 작성이다.

원본 dirty 관측(복사 대상은 없음):

```text
 M packages/vibeagent_domain/src/server/inference/llm/idle.test.ts
 M packages/vibeagent_domain/src/server/inference/llm/index.ts
?? .codex/
?? AGENTS.md
?? README.md
?? apps/admin/AGENTS.md
?? docs/api.md
?? docs/architecture.md
?? docs/constraints.md
?? docs/internals.md
?? docs/overview.md
?? docs/testing.md
?? docs/usage.md
?? pgview-run.mjs
?? tests/model-eval/
```

재동기화: 원본 HEAD/dirty/source byte hash를 다시 고정 → 네 script 변경 diff를 검토 → issus 변경 이유를 재적용 → npm 검증·compose config·외부 컨테이너 충돌/반복 배포를 다시 실행 → manifest 목적 hash와 보고 갱신. 원본 `.env`·token·node_modules·dist·cache는 읽거나 복사하지 않는다.

## registry 확인

확인 시각 `2026-10-21T04:40:35.853130+00:00`. 공식 registry `https://registry.npmjs.org/`의 package metadata `dist-tags.latest`와 해당 version의 engines/peerDependencies/integrity를 확인했다. @types/node는 런타임 24 major의 최신 stable을 골랐다. raw 확인 결과는 `.cache/p1/registry.json`이다. 재현 명령은 `npm view <name> dist-tags engines peerDependencies --json --registry https://registry.npmjs.org/` 및 `npm view @types/node@24 version --json --registry https://registry.npmjs.org/`이며 실제 조회는 Python urllib HTTPS GET으로 각 표의 metadata URL을 읽었다.

| 의존 | pin | 관측 latest | 공식 출처 |
| --- | --- | --- | --- |
| `typescript` | `7.0.2` | `7.0.2` | [metadata](https://registry.npmjs.org/typescript) |
| `turbo` | `2.11.10` | `2.11.10` | [metadata](https://registry.npmjs.org/turbo) |
| `vite` | `8.3.4` | `8.3.4` | [metadata](https://registry.npmjs.org/vite) |
| `react` | `19.3.1` | `19.3.1` | [metadata](https://registry.npmjs.org/react) |
| `react-dom` | `19.3.1` | `19.3.1` | [metadata](https://registry.npmjs.org/react-dom) |
| `express` | `5.3.0` | `5.3.0` | [metadata](https://registry.npmjs.org/express) |
| `esbuild` | `0.28.2` | `0.28.2` | [metadata](https://registry.npmjs.org/esbuild) |
| `tsx` | `4.23.15` | `4.23.15` | [metadata](https://registry.npmjs.org/tsx) |
| `env-schema` | `8.0.1` | `8.0.1` | [metadata](https://registry.npmjs.org/env-schema) |
| `@types/node` | `24.19.2` | `26.6.5` | [metadata](https://registry.npmjs.org/%40types%2Fnode) |
| `@types/react` | `19.3.0` | `19.3.0` | [metadata](https://registry.npmjs.org/%40types%2Freact) |
| `@types/react-dom` | `19.3.0` | `19.3.0` | [metadata](https://registry.npmjs.org/%40types%2Freact-dom) |
| `@types/express` | `5.0.6` | `5.0.6` | [metadata](https://registry.npmjs.org/%40types%2Fexpress) |

React DOM 19.3.1의 peer react ^19.3.1을 exact 19.3.1로 맞췄다. Vite 8.3.4 engines는 `^20.19.0 || >=22.12.0`이므로 root/workspace engines도 `>=20.19.0 <21 || >=22.12.0`로 기록했다. 실제 호스트는 Node v26.4.0/npm 11.17.0, 이미지 Node24·esbuild target node24와 분리한다. npm workspaces 지시를 우선해 pnpm lock과 pnpm 전용 shamefully-hoist 설정은 추가하지 않았다. npm cache는 sandbox에서 쓸 수 있는 `.cache/npm`이다. 내부 `@issus` scope는 `http://verdaccio.neurondev.net:4873`, 직접 registry 설치 대신 agent 로컬 슬롯을 쓴다.

## 이미지·포트·제외 범위

| 항목 | P1 기록 |
| --- | --- |
| Node base | `node:24-alpine`, digest 미확인(Docker daemon 접근 차단) |
| DB base | `ghcr.io/pgmq/pg18-pgmq:v1.10.0`, digest 미확인(동일 차단) |
| 포트 listener | netstat 착수 확인에서 18140·15440 매치 0; 기본 유지 |
| Docker 게시 포트 | daemon 차단으로 별도 확인 불가; deploy-preflight가 실제 배포 전 검사 |
| 배포 runtime | 미실시; Bash CreateFileMapping Win32 error 5, daemon permission denied |
| 빌드 runtime | 7/8 build 성공, Vite windowsSafeRealPathSync의 child_process pipe EPERM으로 front 차단. 설정·의존 소스 패치 없이 외부 재검증 요청 |
| 설치 구분 | 최초 정상 install은 esbuild postinstall EPERM. 진단용 npm install --ignore-scripts exit0 후 일반 npm install exit0(127 audit, 0 vulnerabilities). 깨끗한 install은 정상 권한에서 재검증 필요 |
| DB 인증 판단 | loopback 게시+internal network의 P1 골격은 trust. 운영 token/DB 인증·DATABASE_URL·migration·queue 준비는 P4 통합 시 교체 필요 |
| 제외 | 기존 secret·운영 데이터·외부 container 삭제·volume 삭제·prune·commit·push |

P1 `/ready`는 골격 준비 응답이며 실제 migration/DB/queue/reaction 준비·WS subscribe 성공을 주장하지 않는다. 기능 통합 후 `/ready`와 deploy 검증을 확장하는 것은 P1 후속 세션의 조립 요청으로 처리한다. [시험 보고](../tests/reports/scaffold/20261021_134000.md)에서 실행 계층을 구분한다.
