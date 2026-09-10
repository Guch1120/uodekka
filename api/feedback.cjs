// api/feedback.cjs
// 本番公開環境（Vercelサーバーレス関数）向けのフィードバック受付エンドポイント。
// GitHub Issues APIを使い、送信内容をリポジトリのIssueとして1件ずつ作成する
// （needs.mdのような単一ファイル追記方式は同時送信時に衝突するため採用しない）。
//
// 必須環境変数:
//   GITHUB_TOKEN          issuesへの書き込み権限を持つFine-grained PAT（このリポジトリに限定推奨）
// 任意環境変数:
//   GITHUB_FEEDBACK_REPO  "owner/repo" 形式。未設定時は Guch1120/uodekka を使用
const CATEGORIES = ['不具合報告', '新機能の要望', '操作性・UI改善', 'その他'];
const MAX_MESSAGE_LENGTH = 1000;
const MAX_NAME_LENGTH = 20;
const MAX_BODY_BYTES = 20_000;

function sanitize(value, maxLength) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

async function readJsonBody(req) {
  // Vercel Node runtimeのヘルパーがContent-Type: application/jsonを検知すると
  // req.bodyへ自動でパース済みの値を入れてくれる場合がある。
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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
  const title = `[フィードバック/${category}] ${titleExcerpt}${message.length > 60 ? '…' : ''}`;
  const body = [
    `- **カテゴリ**: ${category}`,
    `- **お名前**: ${name}`,
    `- **送信日時**: ${new Date().toISOString()}`,
    '',
    message
  ].join('\n');

  try {
    const issue = await createGitHubIssue({ token, repo, title, body });
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, issueUrl: issue.html_url }));
  } catch {
    // GitHubトークンや上流のエラー詳細はクライアントへ漏らさない。
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'github-unavailable' }));
  }
}

module.exports = handler;
