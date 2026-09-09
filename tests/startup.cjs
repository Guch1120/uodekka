const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const mode of ['normal', 'fetch', 'syntax', 'initialization']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.route('https://startup.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/backend/game.js' && mode !== 'normal') {
          if (mode === 'fetch') return route.abort();
          return route.fulfill({ contentType: 'text/javascript', body: mode === 'syntax' ? '<<<<<<< HEAD' : 'export class Game { constructor() { throw new Error("test initialization"); } }' });
        }
        const file = path.join(__dirname, '..', url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
        await route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/json' });
      });
      await page.goto('https://startup.test/');
      await page.click('#title-screen');
      if (mode === 'normal') {
        await page.waitForFunction(() => !!window.gameInstance);
        assert.equal(await page.locator('#title-screen').count(), 0);
        // 更新通知を既読にしてホームからソロ開始を確認する。
        if (await page.locator('#btn-update-confirm').isVisible()) await page.click('#btn-update-confirm');
        await page.click('#tab-solo');
        if (await page.locator('#btn-update-confirm').isVisible()) await page.click('#btn-update-confirm');
        await page.click('#course-confirm');
        await page.click('#btn-start-solo');
        await page.waitForFunction(() => window.gameInstance.isRunning);
      } else {
        await page.waitForSelector('#startup-error:not([hidden])');
        assert.match(await page.textContent('#startup-error-message'), mode === 'fetch' ? /取得できません/ : /起動処理/);
        await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
        await page.click('#startup-copy');
        assert.match(await page.textContent('#startup-diagnostic'), new RegExp(mode === 'initialization' ? 'initialization' : 'module'));
        await page.click('#startup-reload');
        await page.waitForFunction(() => !document.querySelector('#title-screen').disabled);
      }
      console.log('PASS startup:', mode);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
