# 호스트 CLI 선검증 (bridge.md §11.2 a/b)

관리자가 별도 native 시험 repo/이슈와 `bridge-codex`/`bridge-claude` session profile을 준비한다. 운영 GitHub #4와 native issus #4는 서로 다른 식별자다. 예시 config의 ISSUS_ISSUES/BOARDS를 시험 범위로 바꾸고, 각 프로필과 alias/sid가 일치하게 한다. 같은 alias 소비자는 한 번에 하나만 실행한다.

준비 명령:

```powershell
npm run build --workspace @issus/mcp
npm test --workspace @issus/mcp
npm run lint --workspace @issus/mcp
codex --version
claude --version
```

Codex 0.163 호스트 실측(ASK6361874801): `approval_policy="never"`에서는 `[mcp_servers.issus]`의 `default_tools_approval_mode="approve"`가 있어야 도구 호출이 허용됐다. `"auto"`는 허용 값이 아니며, 누락 시 모든 MCP 도구가 거부됐다. [설정 예시](codex.config.toml)에 반영했다.

다음 비밀 없는 fixture를 복사한다. 관리자가 profiles와 Codex config.toml·Claude 시험 scope를 준비한다. template의 alias/sid와 principal이 일치해야 한다.

```powershell
New-Item -ItemType Directory -Force F:/dev/issus/.cache/bridge-host
Copy-Item -LiteralPath F:/dev/issus/apps/mcp/examples/codex-mcp-prompt.md -Destination F:/dev/issus/.cache/bridge-host/codex-mcp-prompt.md
Copy-Item -LiteralPath F:/dev/issus/apps/mcp/examples/claude-mcp-prompt.md -Destination F:/dev/issus/.cache/bridge-host/claude-mcp-prompt.md
Copy-Item -LiteralPath F:/dev/issus/apps/mcp/examples/claude.mcp.json -Destination F:/dev/issus/.cache/bridge-host/claude.mcp.json
```

```powershell
Get-Content -Raw -Encoding UTF8 F:/dev/issus/.cache/bridge-host/codex-mcp-prompt.md | codex exec -m gpt-6.1-sol -c 'model_reasoning_effort="high"' -c 'windows.sandbox="unelevated"' -c 'approval_policy="never"' -s workspace-write -C F:/dev/issus --json -o F:/dev/issus/.cache/bridge-host/codex-mcp-result.md -
```

사용자 config.toml을 편집하지 않고 같은 시험 설정을 명령줄로 덮어쓸 수도 있다. 아래 `ISSUS_TEST_ISSUE`는 준비한 native 시험 번호다. 기존 `bridge-codex` session profile에서 URL/token을 읽고 별도 journal을 쓴다(토큰을 argv로 넘기지 않는다). PowerShell 5.1에서는 JSON/TOML 큰따옴표를 native argv에 보존하는 `\"`를 사용한다.

```powershell
Get-Content -Raw -Encoding UTF8 F:/dev/issus/.cache/bridge-host/codex-mcp-prompt.md | codex exec -m gpt-6.1-sol -c 'model_reasoning_effort=\"high\"' -c 'windows.sandbox=\"unelevated\"' -c 'approval_policy=\"never\"' -c 'mcp_servers.issus.command=\"node\"' -c 'mcp_servers.issus.args=[\"F:/dev/issus/apps/mcp/dist/index.js\"]' -c 'mcp_servers.issus.default_tools_approval_mode=\"approve\"' -c 'mcp_servers.issus.startup_timeout_sec=20' -c 'mcp_servers.issus.tool_timeout_sec=1560' -c ('mcp_servers.issus.env.ISSUS_ISSUES=\"'+$env:ISSUS_TEST_ISSUE+'\"') -c 'mcp_servers.issus.env.ISSUS_PROFILE=\"bridge-codex\"' -c 'mcp_servers.issus.env.ISSUS_REPO=\"hikaMaeng/issus\"' -c 'mcp_servers.issus.env.ISSUS_BOARDS=\"\"' -c 'mcp_servers.issus.env.ISSUS_BRIDGE_STATE_DIR=\"F:/dev/issus/.cache/mcp/codex-precheck\"' -s workspace-write -C F:/dev/issus --json -o F:/dev/issus/.cache/bridge-host/codex-mcp-result.md -
```

다른 오케스트레이터 세션이 별도 `bridge-orch` 프로필로 완전한 ASK를 보낸다. ACK-BY는 현재+10분, TO는 시험 alias, 본문 nonce 하나다.

```powershell
issus post --profile bridge-orch --repo hikaMaeng/issus --issue $env:ISSUS_TEST_ISSUE --body-file F:/dev/issus/.cache/bridge-host/ask.md --dry-run
issus post --profile bridge-orch --repo hikaMaeng/issus --issue $env:ISSUS_TEST_ISSUE --body-file F:/dev/issus/.cache/bridge-host/ask.md
```

Claude용 `.cache/bridge-host/claude.mcp.json`은 [예시](claude.mcp.json)의 별도 시험 profile·scope다. prompt alias=`issus-4-clapp`로 바꾼다. 원문 설계의 빈 built-in argv는 PowerShell5.1에서 유실될 수 있어, 호스트는 실제 argv 전달을 먼저 확인한다. `--tools ""`가 빈 문자열로 전달된 증거가 없으면 실행/권한 제한 PASS를 주장하지 않는다.

```powershell
Get-Content -Raw -Encoding UTF8 F:/dev/issus/.cache/bridge-host/claude-mcp-prompt.md | claude -p --model sonnet --effort high --permission-mode plan --tools "" --setting-sources "" --mcp-config F:/dev/issus/.cache/bridge-host/claude.mcp.json --strict-mcp-config --allowedTools "mcp__issus__issus_subscribe,mcp__issus__issus_wait,mcp__issus__issus_inbox,mcp__issus__issus_show,mcp__issus__issus_ack,mcp__issus__issus_handoff_accept,mcp__issus__issus_post,mcp__issus__issus_process,mcp__issus__issus_apply,mcp__issus__issus_status" --output-format json
```

PASS 증거: CLI 버전·비밀 제거 설정 구조·MCP tools/list10개·native source commentId/deliveryId/nonce·직접 ACK/REPORT id·application/process·exit0. credential/config 전체·bearer·profile 원문을 로그에 넣지 않는다. 설정 timeout은 wait 상한보다 크게 둔다. 기본 wait60000 반복을 사용한다.

CLI 종료 뒤 같은 설정을 읽는 앱의 단독 시험 세션에서 사람이 구독/wait를 실행하고 새 nonce의 수신·응답을 확인한다. **CLI 선검증과 Codex/Claude 앱 확인은 별도 판정**이다. 앱에 CLI resume로 연결하지 않는다. Claude Monitor는 [정본 §7](../../../docs/bridge.md#7-claude-code-monitor-ws-경로)의 고정 ws 경로를 보조로 별도 확인한다.
