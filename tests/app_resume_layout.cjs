const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:8099');

  await page.evaluate(() => {
    document.querySelector('#orientation-prompt').classList.add('dismissed');
    window.requestForcedLandscapeLayout();
  });
  const before = await page.evaluate(() => ({
    forced: document.body.classList.contains('force-landscape'),
    transform: getComputedStyle(document.querySelector('#app')).transform
  }));
  assert.equal(before.forced, true);
  assert.notEqual(before.transform, 'none');

  // アプリ復帰直後に横長、少し遅れて本来の縦長寸法へ戻る端末を再現する。
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => document.body.classList.contains('force-landscape')), false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1300);
  const after = await page.evaluate(() => ({
    forced: document.body.classList.contains('force-landscape'),
    transform: getComputedStyle(document.querySelector('#app')).transform,
    landscape: document.body.dataset.isLandscape,
    effectiveSize: [window.deviceInfo.effectiveWidth, window.deviceInfo.effectiveHeight]
  }));
  assert.equal(after.forced, true);
  assert.notEqual(after.transform, 'none');
  assert.equal(after.landscape, 'true');
  assert.deepEqual(after.effectiveSize, [844, 390]);
  assert.deepEqual(errors, []);

  // 実際に横向きの端末で、復帰後の寸法だけが遅れて安定する場合も確認する。
  const naturalPage = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const naturalErrors = [];
  naturalPage.on('pageerror', error => naturalErrors.push(error.message));
  await naturalPage.goto(process.env.GAME_URL || 'http://localhost:8099');
  await naturalPage.evaluate(() => {
    window.__resumeTestSize = [390, 844];
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => window.__resumeTestSize[0] });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => window.__resumeTestSize[1] });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await naturalPage.waitForTimeout(700);
  assert.equal(await naturalPage.evaluate(() => document.body.dataset.isLandscape), 'false');
  await naturalPage.evaluate(() => { window.__resumeTestSize = [844, 390]; });
  await naturalPage.waitForTimeout(650);
  assert.equal(await naturalPage.evaluate(() => document.body.dataset.isLandscape), 'true');
  assert.deepEqual(naturalErrors, []);

  console.log('PASS: CSS強制横画面と実横画面の両方で、復帰後の横画面レイアウトを保持');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
