#!/usr/bin/env node
/**
 * Google OAuth2 リフレッシュトークン取得スクリプト（初回1回だけ実行）
 *
 * 使い方:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-refresh-token.js
 */
import { google } from 'googleapis';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('使い方: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-refresh-token.js');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('\nブラウザが開きます。Googleアカウントでログインして許可してください...\n');
execFile('/usr/bin/open', [authUrl]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  if (!code) return;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h2>✅ 認証完了！このタブを閉じてターミナルを確認してください。</h2>');
  server.close();

  try {
    const { tokens } = await oauth2.getToken(code);
    console.log('━'.repeat(60));
    console.log('✅ リフレッシュトークン取得成功！');
    console.log('━'.repeat(60));
    console.log('\nGitHub Secrets に以下を追加してください:\n');
    console.log(`GOOGLE_CLIENT_ID     = ${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET = ${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN = ${tokens.refresh_token}`);
    console.log('\n');
  } catch (e) {
    console.error('トークン取得エラー:', e.message);
    process.exit(1);
  }
});

server.listen(3000, () => {
  console.log('認証待機中... (ブラウザで許可したら自動的に続きます)\n');
});
