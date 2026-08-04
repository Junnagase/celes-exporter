#!/bin/bash
# launchd から呼ばれるラッパー。Claude Code のヘッドレスモードでスラッシュコマンドを実行する。
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

CLAUDE_BIN=""
for c in "$HOME/.claude/local/claude" "$HOME/.local/bin/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
  [ -x "$c" ] && CLAUDE_BIN="$c" && break
done
if [ -z "$CLAUDE_BIN" ]; then
  echo "claude が見つかりません。which claude の結果をこのスクリプトに追記してください" >&2
  osascript -e 'display notification "claudeコマンドが見つかりません" with title "Celes注文履歴" sound name "Basso"' 2>/dev/null
  exit 1
fi

mkdir -p logs
LOG="logs/run-$(date '+%Y-%m').log"

echo "----- $(date '+%F %T') start -----" >> "$LOG"
"$CLAUDE_BIN" -p "/celes-export" >> "$LOG" 2>&1
STATUS=$?
echo "----- $(date '+%F %T') exit=$STATUS -----" >> "$LOG"

if [ $STATUS -ne 0 ]; then
  osascript -e 'display notification "実行に失敗しました。logs/ を確認してください" with title "Celes注文履歴" sound name "Basso"' 2>/dev/null
fi
exit $STATUS
