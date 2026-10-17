const { chromium } = require('/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true });
  await page.goto('http://localhost:8099');
  await page.evaluate(async () => {
    document.body.innerHTML = '<div id="test-root"></div>';
    const { FeedbackModal } = await import('/frontend/ui/feedback_modal.js');
    window.modal = new FeedbackModal(document.querySelector('#test-root'));
    modal.show();
  });
  let payload;
  await page.route('**/api/feedback', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, imageReceived: true, imageAttached: true } });
  });
  await page.locator('#feedback-message').fill('画像送信の回帰検証');
  await page.locator('#feedback-image').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') });
  assert.match(await page.locator('#feedback-image-name').textContent(), /test.png/);
  await page.evaluate(() => modal.submit());
  assert.match(payload.image, /^data:image\/jpeg;base64,/);
  assert.match(await page.locator('#feedback-status').textContent(), /画像もGitHubに添付/);
  console.log('PASS: GUIファイル選択→JPEG変換→POST→画像受領・保存確認（模擬API）');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
