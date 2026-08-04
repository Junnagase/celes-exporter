import { google } from 'googleapis';
import { createReadStream, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PARENT_FOLDER_ID =
  process.env.DRIVE_PARENT_FOLDER_ID || '1TmAbKao56y7skunoa_-DoPLjYhz35sTp';

function buildAuth() {
  const keyJson = process.env.GOOGLE_SA_KEY;
  if (!keyJson) throw new Error('GOOGLE_SA_KEY が設定されていません');
  const credentials = JSON.parse(keyJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

async function findOrCreateFolder(drive, name, parentId) {
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return created.data.id;
}

async function upsertFile(drive, filePath, fileName, folderId) {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  const media = { mimeType: 'application/pdf', body: createReadStream(filePath) };

  if (res.data.files.length > 0) {
    await drive.files.update({ fileId: res.data.files[0].id, media });
    console.log(`  上書き: ${fileName}`);
  } else {
    await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media,
      fields: 'id',
    });
    console.log(`  アップロード: ${fileName}`);
  }
}

export async function uploadPdfs(outputDir, month) {
  const markerPath = join(outputDir, '.uploaded');
  if (existsSync(markerPath)) {
    console.log(`${month} はアップロード済みのためスキップ`);
    return [];
  }

  const auth = buildAuth();
  const drive = google.drive({ version: 'v3', auth });

  const folderId = await findOrCreateFolder(drive, month, PARENT_FOLDER_ID);
  console.log(`Drive フォルダ: ${month} (${folderId})`);

  const pdfs = readdirSync(outputDir).filter((f) => f.endsWith('.pdf'));
  if (pdfs.length === 0) throw new Error('アップロードするPDFが見つかりません');

  for (const pdf of pdfs) {
    await upsertFile(drive, join(outputDir, pdf), pdf, folderId);
  }

  writeFileSync(markerPath, new Date().toISOString());
  console.log(`完了: ${pdfs.length} 件アップロード`);
  return pdfs;
}
