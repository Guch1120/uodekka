const { chromium } = require('/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
 const page = await browser.newPage();
 await page.goto('http://localhost:8099');
 await page.evaluate(async (modulePath) => {
   document.body.innerHTML = '<div id="input-test"></div>';
   const { InputManager } = await import(modulePath);
   window.input = new InputManager(document.querySelector('#input-test'));
   input.canDrive = () => true;
   input.showControls();
 }, process.env.BASELINE ? '/.vercel/output/static/backend/input/input_manager.js' : '/backend/input/input_manager.js');
 await page.locator('#ctrl-drift').hover(); await page.mouse.down();
 await page.keyboard.down('ArrowRight');
 assert.equal(await page.evaluate(() => input.state.drift), true, '旋回キーで長押しを消さない');
 await page.keyboard.up('ArrowRight');
 assert.equal(await page.evaluate(() => input.state.drift), true);
 await page.keyboard.down('Space'); await page.mouse.up();
 assert.equal(await page.evaluate(() => input.state.drift), true, 'ボタン解放でもキー保持を残す');
 await page.keyboard.up('Space');
 assert.equal(await page.evaluate(() => input.state.drift), false);
 await page.evaluate(() => input.updateDriftFeedback({ speed: 20, isDrifting: true, driftSparkLevel: 2 }));
 assert.equal(await page.locator('#ctrl-drift-status').textContent(), '離して強ターボ');
 await page.evaluate(() => { input.resetState(); input.updateDriftFeedback({ speed: 0 }); });
 assert.equal(await page.locator('#ctrl-drift-status').textContent(), '旋回中に長押し');
 console.log('PASS: ドリフト長押しとキー併用・解放・成立状態の表示');
 await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
