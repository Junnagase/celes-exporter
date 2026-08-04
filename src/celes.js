import { chromium } from 'playwright';

const BASE = 'https://www.celes-perfume.com';
const PDF_OPTS = {
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
};

export async function launch() {
  const headless = process.env.HEADLESS !== 'false';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 1600 },
  });
  return { browser, context };
}

/** WooCommerce の標準ログインフォームでログインする */
export async function login(page) {
  const { CELES_USER, CELES_PASS } = process.env;
  if (!CELES_USER || !CELES_PASS) throw new Error('CELES_USER / CELES_PASS が未設定です');

  await page.goto(`${BASE}/my-account/`, { waitUntil: 'domcontentloaded' });
  await page.fill('#username', CELES_USER);
  await page.fill('#password', CELES_PASS);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.click('button[name="login"], input[name="login"]'),
  ]);

  const loggedIn = await page.locator('.woocommerce-MyAccount-navigation').count();
  if (!loggedIn) {
    const err = await page.locator('.woocommerce-error').first().textContent().catch(() => null);
    throw new Error(`ログインに失敗しました${err ? `: ${err.trim()}` : ''}`);
  }
}

/**
 * 注文履歴を新しい順に取得する。
 * stopBefore（Date）より古い注文に到達した時点でページングを打ち切る。
 */
export async function fetchOrders(page, { stopBefore, maxPages = 20 } = {}) {
  const orders = [];

  for (let p = 1; p <= maxPages; p++) {
    const url = p === 1 ? `${BASE}/my-account/orders/` : `${BASE}/my-account/orders/page/${p}/`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const rows = await page.$$eval('.woocommerce-orders-table__row', (trs) =>
      trs.map((tr) => {
        const link = tr.querySelector('.woocommerce-orders-table__cell-order-number a');
        const time = tr.querySelector('time');
        const text = (sel) => tr.querySelector(sel)?.textContent.trim().replace(/\s+/g, ' ') ?? '';
        return {
          number: text('.woocommerce-orders-table__cell-order-number').replace(/^#/, ''),
          href: link?.href ?? null,
          dateISO: time?.getAttribute('datetime') ?? null,
          dateText: text('.woocommerce-orders-table__cell-order-date'),
          status: text('.woocommerce-orders-table__cell-order-status'),
          total: text('.woocommerce-orders-table__cell-order-total'),
        };
      })
    );

    if (rows.length === 0) break;

    let reachedOlder = false;
    for (const r of rows) {
      r.date = r.dateISO ? new Date(r.dateISO) : parseJaDate(r.dateText);
      orders.push(r);
      if (stopBefore && r.date && r.date < stopBefore) reachedOlder = true;
    }
    if (reachedOlder) break;

    const hasNext = await page.locator('.woocommerce-pagination a.next').count();
    if (!hasNext) break;
  }

  return orders;
}

/** 「2026年7月15日」「2026/07/15」など日本語表記のフォールバック */
function parseJaDate(text) {
  if (!text) return null;
  const m = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - 9 * 3600 * 1000);
}

/** 注文詳細ページをPDF化してBufferで返す */
export async function renderOrderPdf(page, order) {
  await page.goto(order.href, { waitUntil: 'networkidle' });
  // 印刷時に邪魔になる要素を隠す
  await page.addStyleTag({
    content: `
      header, footer, nav, .site-header, .site-footer, #totop,
      .woocommerce-MyAccount-navigation, .navbar, .header-management,
      iframe, .instagram-feed { display: none !important; }
      body { background: #fff !important; }
    `,
  });
  return await page.pdf(PDF_OPTS);
}

/** 対象月の注文一覧サマリーをPDF化する */
export async function renderSummaryPdf(page, orders, monthLabel) {
  const rows = orders
    .map(
      (o) => `<tr>
        <td>${escapeHtml(o.number)}</td>
        <td>${escapeHtml(o.dateText)}</td>
        <td>${escapeHtml(o.status)}</td>
        <td class="r">${escapeHtml(o.total)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
    <style>
      body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; padding: 24px; color:#222; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .sub { color:#666; font-size: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      th { background: #f4f4f4; }
      td.r { text-align: right; white-space: nowrap; }
    </style></head><body>
    <h1>Celes 注文履歴 ${monthLabel}</h1>
    <div class="sub">出力日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} / 件数: ${orders.length}</div>
    <table>
      <thead><tr><th>注文番号</th><th>注文日</th><th>ステータス</th><th>合計</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">対象期間の注文はありません</td></tr>'}</tbody>
    </table>
  </body></html>`;

  await page.setContent(html, { waitUntil: 'load' });
  return await page.pdf(PDF_OPTS);
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
