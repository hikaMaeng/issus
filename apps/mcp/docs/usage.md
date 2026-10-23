# 사용

호스트가 root workspace·lock을 통합하고 의존성을 설치한 뒤 실행한다.

```powershell
npm run build --workspace @issus/mcp
npm test --workspace @issus/mcp
npm run lint --workspace @issus/mcp
```

필수 환경: `ISSUS_REPO=owner/repo`, `ISSUS_ISSUES=4`와 URL/token 또는 기존 session profile.
URL 우선순위는 ISSUS_URL → ISSUS_SERVER_URL → profile.server. token은 ISSUS_TOKEN → profile.token이다. 저장 토큰을 다른 서버에 보내지 않는다.
옵션은 `--profile NAME`, `--profiles-file ABS`, `--state-dir ABS`만 있다.
ISSUS_BOARDS는 CSV, issue 본문의 같은 repo BOARD와 합친다. ISSUS_POLL_MS는250~10000(기본1000).
상태 디렉터리는 절대 경로이며 기본은 기존 profile 디렉터리 아래 bridge다.

- [Codex config.toml](../examples/codex.config.toml)을 관리자 설정에 병합한다.
- [Claude .mcp.json](../examples/claude.mcp.json)을 관리자에게 적용하도록 전달한다.
- [세션 지시문](../../../docs/bridge-session-prompt.md)을 새 세션의 실제 alias/sid에 맞춰 실행한다.
- [호스트 CLI 선검증](../examples/host-precheck.md)은 별도 시험 profile/이슈·nonce를 사용한다.

Codex 0.163 호스트 실측(ASK6361874801): `approval_policy="never"`에서 `[mcp_servers.issus]`에 `default_tools_approval_mode="approve"`가 필요하다. 누락 시 모든 MCP 도구가 거부됐고 `"auto"`는 유효하지 않았다. 사용자 config.toml 대신 `codex exec -c`로 설정하는 전체 예시는 host-precheck에 있다.

토큰을 TOML·JSON·argv·프롬프트에 쓰지 않는다. profile은 관리자가 기존 CLI로 저장한다. 이 앱은 credential 파일을 쓰거나 기존 앱 설정을 자동 편집하지 않는다.

Codex `command/args/env/env_vars`와 초 단위 `tool_timeout_sec`는 [OpenAI Docs MCP 설정](https://learn.chatgpt.com/docs/extend/mcp)을 따른다. 앱/CLI 설정 연결은 [공식 개발자 설정](https://learn.chatgpt.com/docs/developer-settings)을 대조했다(2026-10-23). 실제 앱 수용은 별도 확인한다.
