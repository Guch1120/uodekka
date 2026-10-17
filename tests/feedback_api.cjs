// 上流GitHubを模擬し、ソースと配信用関数の画像永続化を同じ条件で確認する。
const assert = require('node:assert/strict');
(async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-only';
  try {
    for (const file of ['../api/feedback.cjs', '../.vercel/output/functions/api/feedback.func/index.cjs']) {
      const handler = require(file);
      for (const uploadFails of [false, true]) {
        const calls = [];
        global.fetch = async (url, options) => {
          calls.push({ url, body: JSON.parse(options.body) });
          if (options.method === 'PUT') return { ok: !uploadFails, status: uploadFails ? 403 : 201 };
          return { ok: true, json: async () => ({ html_url: 'https://github.com/test/repo/issues/1' }) };
        };
        let result;
        const response = { setHeader() {}, end(body) { result = JSON.parse(body); } };
        await handler({ method: 'POST', headers: {}, body: { message: '画像添付テスト', image: 'data:image/jpeg;base64,/9j/2Q==' } }, response);
        assert.equal(response.statusCode, uploadFails ? 502 : 200);
        assert.equal(calls.length, uploadFails ? 1 : 2);
        if (!uploadFails) {
          assert.equal(result.imageReceived, true);
          assert.equal(result.imageAttached, true);
          assert.equal(calls[0].body.content, '/9j/2Q==');
          assert.match(calls[1].body.body, /!\[添付画像\]\(https:\/\/raw.githubusercontent.com\/.+feedback-assets\/.+\.jpg\)/);
        }
      }
    }
    console.log('PASS: ソース・配信APIの画像保存→Issue本文、保存失敗時のIssue作成抑止（模擬GitHub）');
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = originalToken;
  }
})().catch(error => { console.error(error); process.exit(1); });
