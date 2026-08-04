# celes-order-pdf

Celes（celes-perfume.com）にログインし、**前月分の注文履歴をPDF化してGoogle Driveに格納する**仕組み。

Google Cloud の設定は不要。Drive への書き込みは Claude Code の MCP に任せる。

## 役割分担

| 担当 | 処理 | 理由 |
|---|---|---|
| Playwright（本スクリプト） | ログイン・注文抽出・PDF生成 | 毎回同じ結果が必要な部分。スクリプトで固定する |
| Claude Code + MCP | Driveへのアップロード | Google Cloud設定を避けられる |

生成したPDFはローカルの `output/YYYY-MM/` に出る。スクリプトは標準出力の末尾に `STATUS` と `OUTPUT_DIR` を出すので、Claude Code はそれを見てアップロードする。

## セットアップ

### 1. 依存関係

```bash
npm install
npx playwright install chromium
```

### 2. Celesのログイン情報

```bash
./scripts/setup-keychain.sh   # 対話入力。画面には表示されない
```

### 3. Google Drive MCP を Claude Code に追加

```bash
claude mcp add --transport http google-drive https://drivemcp.googleapis.com/mcp/v1
```

Claude Code を起動して `/mcp` を実行し、認証を済ませる。

**重要**: 同じく `/mcp` でツール一覧を確認し、**ファイル作成/アップロード系のツールがあるか**を必ず見ること。検索・閲覧しかできないMCPだと書き込めない。無い場合は後述の案Bに切り替える。

### 4. アップロード先を書き込む

`.claude/commands/celes-export.md` を開き、`<ここにDriveのURLを貼る>` を実際のフォルダURLに置き換える。

### 5. 動作確認

```bash
npm run debug-login          # ブラウザが開く。ログインできるか目視確認
npm start                    # PDFが output/YYYY-MM/ に出るか確認
TARGET_MONTH=2026-06 npm start   # 過去月で試す
```

Claude Code で `/celes-export` を実行し、Driveに入ることを確認する。

### 6. 自動化（任意）

```bash
./scripts/install.sh
```

毎日10:00に `claude -p "/celes-export"` を実行する。処理済みの月なら即終了する。

## 取りこぼしの防止

完了判定は `output/YYYY-MM/.uploaded` の有無で行う。このマーカーはアップロードが全て成功したときだけ作られる。毎日起動して未処理の月があれば埋める方式なので、1回失敗しても翌日に自動で回復する。

launchd は指定時刻をスリープで逃した場合、復帰後に実行を拾う（cronは捨てるため不採用）。

## 案B: MCPを使わない代替

Google ドライブ デスクトップ版を入れている場合、同期フォルダに直接出力すればアップロード処理自体が不要になる。

```bash
# .env または Keychain に設定
OUTPUT_DIR=/Users/you/Library/CloudStorage/GoogleDrive-you@gmail.com/マイドライブ/経費/Celes
```

この場合 `scripts/run.sh` の中身を `npm start` に変えれば、Claude Code を介さない完全なスクリプト運用になる。**最も部品が少なく壊れにくい構成**なので、MCPでの書き込みが難しかったらこちらに寄せるとよい。

## 注意点

- `page.pdf()` は Chromium のヘッドレスモードのみ対応。`npm run debug-login` ではPDFは生成されない
- MCPのOAuthトークンが失効すると、自動実行時に再認証を求められて止まる。その場合は一度Claude Codeを開いて `/mcp` から認証し直す
- サイトのHTML構造が変わるとセレクタ調整が必要。`src/celes.js` の `.woocommerce-orders-table__row` 周辺と `login()` を確認する
- ログは `logs/run-YYYY-MM.log`。失敗時はmacOSの通知が出る
