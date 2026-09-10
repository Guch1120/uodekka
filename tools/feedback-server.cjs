#!/usr/bin/env node
// tools/feedback-server.cjs
// ローカル開発専用: ゲーム内「ご意見・ご要望」フォームの送信内容を受け取り、
// このリポジトリ直下の needs.md にMarkdown形式で追記するだけの最小HTTPサーバー。
//
// 本番公開（Vercel静的配信 + Cloudflare Workers）にはこのサーバーは含まれない。
// 開発者のローカルマシンで `node tools/feedback-server.cjs`（または `npm run feedback:server`）
// を起動している間だけ、ゲーム内フォームからの送信を受け付ける。
// スマホ等の同一LAN内の端末からテストする場合は、window.FEEDBACK_SERVER_URL を
// このマシンのIPアドレスに向けて上書きすること。

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.FEEDBACK_PORT) || 8787;
const NEEDS_FILE = path.join(__dirname, '..', 'needs.md');
const CATEGORIES = ['不具合報告', '新機能の要望', '操作性・UI改善', 'その他'];
const MAX_MESSAGE_LENGTH = 1000;
const MAX_NAME_LENGTH = 20;
const MAX_BODY_BYTES = 20_000;

function sanitizeText(value, maxLength) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

function appendFeedback({ category, name, message }) {
  const safeCategory = CATEGORIES.includes(category) ? category : 'その他';
  const safeName = sanitizeText(name, MAX_NAME_LENGTH) || '匿名';
  const timestamp = new Date().toISOString();

  if (!fs.existsSync(NEEDS_FILE)) {
    fs.writeFileSync(NEEDS_FILE, '# ユーザーからのご意見・ご要望\n\nゲーム内フィードバックフォームからの送信を自動的に追記します。\n', 'utf8');
  }

  const block = `\n## ${timestamp}\n\n- **カテゴリ**: ${safeCategory}\n- **お名前**: ${safeName}\n\n${message}\n\n---\n`;
  fs.appendFileSync(NEEDS_FILE, block, 'utf8');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || new URL(req.url, `http://${req.headers.host}`).pathname !== '/feedback') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  let body = '';
  let tooLarge = false;
  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      req.destroy();
    }
  });

  req.on('end', () => {
    if (tooLarge) return;
    try {
      const data = JSON.parse(body);
      const message = sanitizeText(data.message, MAX_MESSAGE_LENGTH);
      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'message is required' }));
        return;
      }
      appendFeedback({ category: data.category, name: data.name, message });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid request' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[feedback-server] listening on http://localhost:${PORT}/feedback`);
  console.log(`[feedback-server] appending to ${NEEDS_FILE}`);
});
