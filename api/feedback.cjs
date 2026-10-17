// api/feedback.cjs
// 本番公開環境（Vercelサーバーレス関数）向けのフィードバック受付エンドポイント。
// GitHub Issues APIを使い、送信内容をリポジトリのIssueとして1件ずつ作成する
// （needs.mdのような単一ファイル追記方式は同時送信時に衝突するため採用しない）。
//
// 必須環境変数:
//   GITHUB_TOKEN          issuesへの書き込み権限を持つFine-grained PAT（このリポジトリに限定推奨）
// 任意環境変数:
//   GITHUB_FEEDBACK_REPO  "owner/repo" 形式。未設定時は Guch1120/uodekka を使用
const crypto = require('node:crypto');
const CATEGORIES = ['不具合報告', '新機能の要望', '操作性・UI改善', 'その他'];
const MAX_MESSAGE_LENGTH = 1000;
const MAX_NAME_LENGTH = 20;
const MAX_BODY_BYTES = 3_000_000;
const MAX_IMAGES = 5;
const MAX_IMAGE_CHARS = 240_000;

// クライアント側の除外に頼らず、公開する動作情報をサーバーでも許可リストに限定する。
function publicDiagnostics(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const output = { schema: 1 };
  const enums = {
    browser: ['Safari', 'Chrome', 'Firefox', 'Edge', 'Opera', 'Other'], os: ['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'Other'],
    screen: ['startup', 'home', 'solo', 'room', 'vehicle-detail', 'race', 'pause', 'result'], mode: ['solo', 'multiplayer'],
    course: ['none', 'custom', 'course1', 'course2', 'course3', 'course4', 'course5', 'course6', 'course7'],
    control: ['gyro', 'stick', 'unknown'], quality: ['high', 'normal', 'low', 'unknown'],
    nativeOrientation: ['portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary', 'unknown']
  };
  for (const [key, values] of Object.entries(enums)) if (values.includes(input[key])) output[key] = input[key];
  if (typeof input.appVersion === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input.appVersion)) output.appVersion = input.appVersion;
  for (const key of ['browserMajor', 'osMajor', 'viewportWidth', 'viewportHeight', 'visualWidth', 'visualHeight', 'effectiveWidth', 'effectiveHeight', 'dpr', 'safeTop', 'safeRight', 'safeBottom', 'safeLeft']) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key]) && input[key] >= 0 && input[key] <= 20000) output[key] = Math.round(input[key] * 100) / 100;
  }
  for (const key of ['cssLandscape', 'reverse', 'standalone', 'fullscreen', 'fullscreenAvailable', 'orientationLockAvailable', 'autoAccelerate']) if (typeof input[key] === 'boolean') output[key] = input[key];
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (typeof commit === 'string' && /^[a-f0-9]{40}$/.test(commit)) output.serverCommit = commit;
  return output;
}

function readImages(data) {
  const images = data.images !== undefined ? data.images : data.image ? [data.image] : [];
  if (!Array.isArray(images) || images.length > MAX_IMAGES) throw new Error('invalid images');
  for (const image of images) {
    if (typeof image !== 'string' || image.length > MAX_IMAGE_CHARS || !/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('invalid image');
    const [header, encoded] = image.split(',');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new Error('invalid base64');
    const type = header.match(/image\/(jpeg|png|gif|webp)/)[1];
    const valid = type === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : type === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === 'gif' ? /^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new Error('invalid image signature');
  }
  return images;
}

function sanitize(value, maxLength) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

async function readJsonBody(req) {
  // Vercel Node runtimeのヘルパーがContent-Type: application/jsonを検知すると
  // req.bodyへ自動でパース済みの値を入れてくれる場合がある。
  if (req.body !== undefined && req.body !== null) {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > MAX_BODY_BYTES) throw new Error('payload too large');
    return typeof body === 'string' ? JSON.parse(body) : body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('payload too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function createIssue({ token, repo, title, body, labels }) {
  return fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'uodekka-feedback-form'
    },
    body: JSON.stringify(labels ? { title, body, labels } : { title, body }),
    signal: AbortSignal.timeout(8000)
  });
}

async function uploadImage({ token, repo, image }) {
  if (!image) return '';
  const [, encoded] = image.split(',', 2);
  const type = image.match(/^data:image\/(jpeg|png|gif|webp);/)[1];
  const extension = type === 'jpeg' ? 'jpg' : type;
  const path = `feedback-assets/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'uodekka-feedback-form'
    },
    body: JSON.stringify({
      message: `chore: add feedback image ${path.split('/').pop()}`,
      content: encoded
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    console.error('[feedback] GitHub asset upload failed', response.status);
    throw new Error(`GitHub asset upload error: ${response.status}`);
  }
  // Contents APIのレスポンスにdownload_urlが含まれない場合があるため、
  // 保存先が確定した時点でraw.githubusercontent.comのURLを組み立てる。
  return `https://raw.githubusercontent.com/${repo}/main/${path}`;
}

async function createGitHubIssue({ token, repo, title, body }) {
  // labelが未作成のリポジトリでも失敗させないよう、ラベル付きで失敗したらラベル無しで再試行する。
  let response = await createIssue({ token, repo, title, body, labels: ['feedback'] });
  if (!response.ok) {
    response = await createIssue({ token, repo, title, body, labels: null });
  }
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
  return response.json();
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'method-not-allowed' }));
    return;
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_FEEDBACK_REPO || 'Guch1120/uodekka';
  if (!token) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'feedback-unavailable' }));
    return;
  }

  let data;
  try {
    data = await readJsonBody(req);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid body');
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'invalid-request' }));
    return;
  }

  const message = sanitize(data.message, MAX_MESSAGE_LENGTH);
  if (!message) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'message-required' }));
    return;
  }
  const category = CATEGORIES.includes(data.category) ? data.category : 'その他';
  const name = sanitize(data.name, MAX_NAME_LENGTH) || '匿名';

  const titleExcerpt = message.replace(/\n/g, ' ').slice(0, 60);
  let images;
  try { images = readImages(data); } catch {
    res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid-images' })); return;
  }
  const diagnostics = publicDiagnostics(data.diagnostics);
  const title = `[フィードバック/${category}] ${titleExcerpt}${message.length > 60 ? '…' : ''}`;
  const steps = sanitize(data.steps, 500);
  const body = [
    `- **カテゴリ**: ${category}`,
    `- **お名前**: ${name}`,
    `- **送信日時**: ${new Date().toISOString()}`,
    '',
    message,
    ...(steps ? ['', '### 再現手順', steps] : [])
  ].join('\n');

  try {
    // Contents APIは同じブランチへの並列更新が衝突するため、画像を順番に保存する。
    const imageUrls = [];
    for (const image of images) imageUrls.push(await uploadImage({ token, repo, image }));
    const appendix = diagnostics ? `\n\n### 動作情報（公開用）\n\n\`\`\`json\n${JSON.stringify(diagnostics, null, 2)}\n\`\`\`` : '';
    const bodyWithImage = body + appendix + imageUrls.map((url, i) => `\n\n![添付画像${imageUrls.length > 1 ? ' ' + (i + 1) : ''}](${url})`).join('');
    const issue = await createGitHubIssue({ token, repo, title, body: bodyWithImage });
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      storage: 'github',
      issueUrl: issue.html_url,
      imageReceived: images.length > 0,
      imageAttached: imageUrls.length > 0,
      imagesReceived: images.length,
      imagesAttached: imageUrls.length
    }));
  } catch {
    // GitHubトークンや上流のエラー詳細はクライアントへ漏らさない。
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'github-unavailable' }));
  }
}

module.exports = handler;
module.exports.publicDiagnostics = publicDiagnostics;
module.exports.readImages = readImages;
