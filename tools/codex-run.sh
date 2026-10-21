#!/usr/bin/env bash
# Run one delegated Codex task and keep its evidence (prompt, transcript, last message).
# usage: tools/codex-run.sh <name> <model> <effort> <read-only|workspace-write> <prompt-file>
# Evidence: .cache/agent-runs/<name>-<stamp>/{prompt.md,transcript.log,result.md,meta.txt}
set -uo pipefail
name="$1"; model="$2"; effort="$3"; sandbox="$4"; prompt="$5"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
out="$root/.cache/agent-runs/$name-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$out"
cp "$prompt" "$out/prompt.md"
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
start=$(date +%s)
codex exec -m "$model" \
  -c "model_reasoning_effort=$effort" \
  -c 'windows.sandbox="unelevated"' \
  -c 'sandbox_workspace_write.network_access=true' \
  -s "$sandbox" -C "$root" --skip-git-repo-check \
  -o "$out/result.md" - < "$prompt" > "$out/transcript.log" 2>&1
code=$?
printf 'name=%s model=%s effort=%s sandbox=%s exit=%s elapsed=%ss out=%s\n' \
  "$name" "$model" "$effort" "$sandbox" "$code" "$(( $(date +%s) - start ))" "$out" | tee "$out/meta.txt"
exit "$code"
