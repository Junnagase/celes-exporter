// Celes のログイン情報の読み込み。macOS Keychain を第一優先、無ければ .env にフォールバック。
import { execFileSync } from 'node:child_process';

const SERVICE = 'celes-order-pdf';
const KEYS = ['CELES_USER', 'CELES_PASS'];

function fromKeychain(account) {
  try {
    return execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-w', '-s', SERVICE, '-a', account],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    return null; // 未登録
  }
}

export function loadSecrets() {
  if (process.platform !== 'darwin') return;
  let loaded = 0;
  for (const k of KEYS) {
    const v = fromKeychain(k);
    if (v) {
      process.env[k] = v;
      loaded++;
    }
  }
  if (loaded) console.log(`Keychainから${loaded}件の認証情報を読み込みました`);
}
