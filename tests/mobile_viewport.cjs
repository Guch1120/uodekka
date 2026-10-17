// ブラウザUIによりCSSの大きいviewportと実際の表示領域が異なる状態を模擬する。
const { chromium } = require('/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
 for (const [width, height, visibleHeight] of [[393,852,720],[412,915,790],[852,393,330]]) {
  const page = await browser.newPage({viewport:{width,height}});
  if (process.env.BASELINE) await page.route('**/css/*.css', route => route.continue({ url: route.request().url().replace('/css/', '/.vercel/output/static/css/') }));
  await page.goto('http://localhost:8099');
  await page.evaluate(h => {
   Object.defineProperty(window, 'innerHeight', { configurable:true, value:h });
   window.dispatchEvent(new Event('resize'));
  },visibleHeight);
  let size = await page.evaluate(() => ({w:document.querySelector('#app').offsetWidth,h:document.querySelector('#app').offsetHeight}));
  assert.deepEqual(size,{w:width,h:visibleHeight},'実表示領域とルート寸法を一致させる');
  if (width < height) {
   await page.evaluate(() => window.requestForcedLandscapeLayout());
   size = await page.evaluate(() => ({w:document.querySelector('#app').offsetWidth,h:document.querySelector('#app').offsetHeight}));
   assert.deepEqual(size,{w:visibleHeight,h:width});
  }
  await page.close();
 }
 console.log('PASS: iPhone 16・Pixel 9相当の縦横画面、ブラウザUIによる表示領域縮小（模擬）');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
