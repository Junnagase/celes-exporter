import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { loadSecrets } from './secrets.js';
import { launch, login, fetchOrders, renderOrderPdf, renderSummaryPdf } from './celes.js';
import { uploadPdfs } from './upload.js';

loadSecrets();

const FORCE = process.env.FORCE === '1';
// 出力先。Googleドライブ デスクトップ版の同期フォルダを指定すればそのまま同期される。
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'output';

/** JST基準で「前月」の期間を返す。TARGET_MONTH=YYYY-MM があればそちらを優先 */
function targetMonthRange(now = new Date()) {
  let y, m; // m は 0-based
  if (process.env.TARGET_MONTH) {
    const [ys, ms] = process.env.TARGET_MONTH.split('-');
    y = +ys;
    m = +ms - 1;
  } else {
    const jst = new Date(now.getTime() + 9 * 3600 * 1000);
    y = jst.getUTCFullYear();
    m = jst.getUTCMonth() - 1; // 前月
  }
  const start = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);
  const end = new Date(Date.UTC(y, m + 1, 1) - 9 * 3600 * 1000);
  const norm = new Date(Date.UTC(y, m, 1));
  const label = `${norm.getUTCFullYear()}-${String(norm.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start, end, label };
}

function fileNameFor(order, label) {
  const d = order.date
    ? new Date(order.date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    : label;
  return `celes_${label}_order-${order.number}_${d}.pdf`;
}

/** 失敗を見逃さないための通知（macOSのみ） */
function notify(title, message) {
  if (process.platform !== 'darwin') return;
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Basso"`;
  execFile('/usr/bin/osascript', ['-e', script], () => {});
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { start, end, label } = targetMonthRange();
  const dir = path.join(OUTPUT_DIR, label);
  console.log(`[${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}] 対象月: ${label}`);

  // 冪等性ガード: アップロード済みマーカーがあれば何もしない。
  // これにより毎日起動しても副作用がなく、取り逃した月は次の起動で自動的に埋まる。
  if (!FORCE && (await exists(path.join(dir, '.uploaded')))) {
    console.log(`${label} はアップロード済みのためスキップ`);
    console.log('STATUS=skipped');
    return;
  }

  await fs.mkdir(dir, { recursive: true });

  const { browser, context } = await launch();
  const page = await context.newPage();
  const created = [];

  try {
    await login(page);
    console.log('ログイン成功');

    const all = await fetchOrders(page, { stopBefore: start });
    const targets = all.filter((o) => o.date && o.date >= start && o.date < end);
    console.log(`取得: ${all.length}件 / 対象月: ${targets.length}件`);

    for (const o of targets) {
      if (!o.href) {
        console.warn(`  スキップ（詳細リンクなし）: ${o.number}`);
        continue;
      }
      const name = fileNameFor(o, label);
      const pdf = await renderOrderPdf(page, o);
      await fs.writeFile(path.join(dir, name), pdf);
      created.push(name);
      console.log(`  作成: ${name}`);
    }

    const summaryName = `celes_${label}_注文一覧.pdf`;
    const summary = await renderSummaryPdf(page, targets, label);
    await fs.writeFile(path.join(dir, summaryName), summary);
    created.push(summaryName);
    console.log(`  作成: ${summaryName}`);

    console.log('---');
    console.log(`OUTPUT_DIR=${path.resolve(dir)}`);
    console.log(`MONTH=${label}`);
    console.log(`FILE_COUNT=${created.length}`);

    // 認証情報が設定されていれば自動でDriveにアップロード（クラウド実行時）
    if (process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_SA_KEY) {
      console.log('Drive へアップロード中...');
      await uploadPdfs(path.resolve(dir), label);
      console.log('STATUS=uploaded');
    } else {
      // ローカル実行時: MCPコマンドがアップロードを担う
      console.log('STATUS=ready_to_upload');
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((e) => {
  console.error('エラー:', e.stack || e.message);
  notify('Celes注文履歴の取得に失敗', e.message);
  console.log('STATUS=failed');
  process.exit(1);
});
