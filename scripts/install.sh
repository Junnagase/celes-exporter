#!/bin/bash
# launchd への登録。プロジェクトのパスを埋め込んで ~/Library/LaunchAgents に配置する。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.celes.order-pdf"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_DIR/logs"
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PROJECT_DIR/scripts/$LABEL.plist" > "$DEST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"

echo "登録しました: $DEST"
echo
echo "確認:   launchctl print gui/$(id -u)/$LABEL | head -20"
echo "即実行: launchctl kickstart -p gui/$(id -u)/$LABEL"
echo "解除:   launchctl bootout gui/$(id -u)/$LABEL"
