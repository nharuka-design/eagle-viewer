// ============================================================
//  Eagle Viewer — Google Apps Script バックエンド
//  設置場所: Google Apps Script (script.google.com)
//  デプロイ: ウェブアプリとして公開（全員アクセス可・匿名OK）
// ============================================================

// ── 設定 ────────────────────────────────────────────────────
// あなたの Eagle ライブラリのルートフォルダIDをここに貼る
const LIBRARY_ROOT_ID = 'ここにフォルダIDを貼る';
// ────────────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action || 'load';

  let result;
  try {
    if (action === 'load') {
      result = loadLibrary();
    } else if (action === 'thumbs') {
      const page = parseInt(e.parameter.page || '0');
      result = getThumbs(page);
    } else {
      result = { error: 'unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── ライブラリ全体を読み込む ────────────────────────────────
function loadLibrary() {
  const rootFiles = listFiles(LIBRARY_ROOT_ID);

  // .library フォルダを探す
  let libRoot = rootFiles;
  const libDir = rootFiles.find(f => f.mimeType === 'application/vnd.google-apps.folder' && f.name.endsWith('.library'));
  if (libDir) libRoot = listFiles(libDir.id);

  // metadata.json と images フォルダを特定
  const metaFile  = libRoot.find(f => f.name === 'metadata.json' && f.mimeType !== 'application/vnd.google-apps.folder');
  const imagesDir = libRoot.find(f => f.mimeType === 'application/vnd.google-apps.folder' && f.name.toLowerCase() === 'images');

  // フォルダ構造を metadata.json から取得
  let folders = [];
  if (metaFile) {
    try {
      const content = JSON.parse(DriveApp.getFileById(metaFile.id).getBlob().getDataAsString());
      folders = content.folders || [];
    } catch (e) {}
  }

  // .info フォルダ一覧を全件取得（ページネーション対応）
  const items = [];
  if (imagesDir) {
    let pageToken = null;
    do {
      const opts = { pageToken, pageSize: 1000, mimeType: 'application/vnd.google-apps.folder' };
      const result = listFilesWithToken(imagesDir.id, opts);
      for (const infoFolder of result.files) {
        const item = readInfoFolder(infoFolder);
        if (item) items.push(item);
      }
      pageToken = result.nextPageToken;
    } while (pageToken);
  }

  return { folders, items, total: items.length };
}

// ── .info フォルダ1件を読む ─────────────────────────────────
function readInfoFolder(folder) {
  const files = listFiles(folder.id);
  const metaFile = files.find(f => f.name === 'metadata.json');
  const thumbFile = files.find(f => f.name.endsWith('_thumbnail.png') || f.name === 'thumbnail.png' || f.name === 'thumbnail.jpg');
  const srcFile = files.find(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ['jpg','jpeg','png','gif','webp','mp4','mov','webm','m4v','svg','avif'].includes(ext)
      && !f.name.endsWith('_thumbnail.png') && f.name !== 'metadata.json';
  });

  let meta = {};
  if (metaFile) {
    try {
      meta = JSON.parse(DriveApp.getFileById(metaFile.id).getBlob().getDataAsString());
    } catch (e) {}
  }

  return {
    id:         meta.id         || folder.name.replace('.info', ''),
    name:       meta.name       || folder.name.replace('.info', ''),
    tags:       meta.tags       || [],
    folders:    meta.folders    || [],
    annotation: meta.annotation || '',
    mtime:      meta.mtime      || 0,
    ext:        (meta.ext || '').toLowerCase(),
    width:      meta.width  || 0,
    height:     meta.height || 0,
    thumbId:    thumbFile ? thumbFile.id : null,
    srcId:      srcFile   ? srcFile.id   : null,
  };
}

// ── Drive ファイル一覧 ──────────────────────────────────────
function listFiles(parentId) {
  const files = [];
  let pageToken = null;
  do {
    const result = Drive.Files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 1000,
      pageToken: pageToken,
    });
    files.push(...(result.files || []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return files;
}

function listFilesWithToken(parentId, opts) {
  return Drive.Files.list({
    q: `'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
    pageSize: opts.pageSize || 1000,
    pageToken: opts.pageToken || null,
  });
}
