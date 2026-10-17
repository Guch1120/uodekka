const { chromium } = require('/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
 const page = await browser.newPage({ viewport:{width:852,height:393}, hasTouch:true });
 // iPhone相当の全画面非対応経路を固定し、CSS横画面も検証する。
 await page.addInitScript(() => { Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined; });
 if (process.env.BASELINE) await page.route('**/css/lobby.css', route => route.fulfill({contentType:'text/css',body:require('node:fs').readFileSync('/tmp/uodekka-lobby-before.css')}));
 await page.goto('http://localhost:8099');
 assert.equal(await page.locator('#btn-dismiss-orientation').count(),0);
 assert.equal(await page.locator('#btn-force-landscape').count(),0);
 await page.evaluate(async () => {
   const { UPDATE_NOTIFICATION } = await import('/frontend/data/updates.js');
   localStorage.setItem('kart_last_read_update_version', UPDATE_NOTIFICATION.version);
 });
 await page.click('#title-screen');
 await page.waitForFunction(() => !!window.gameInstance);
 for (const [width,height,visibleHeight] of [[852,393,393],[915,412,412],[852,393,330],[393,852,852],[393,852,720]]) {
   await page.setViewportSize({width,height});
   await page.evaluate(h => { Object.defineProperty(window,'innerHeight',{configurable:true,value:h}); Object.defineProperty(window.visualViewport,'height',{configurable:true,value:h}); window.dispatchEvent(new Event('resize')); },visibleHeight);
   for (const [screen,selector] of [['home','#tab-solo'],['solo','#btn-start-solo']]) {
     await page.evaluate(name => { gameInstance.lobbyModal.showScreen(name); if (name === 'solo') gameInstance.lobbyModal.updateCourse(); }, screen);
     await page.evaluate(() => new Promise(requestAnimationFrame));
     const bounds = await page.locator(selector).evaluate(el => {
       const r=el.getBoundingClientRect(); const app=document.querySelector('#app').getBoundingClientRect();
       return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,appBottom:app.bottom};
     });
     assert.ok(bounds.width>0 && bounds.height>0 && bounds.left>=0 && bounds.right<=width && bounds.top>=0 && bounds.bottom<=visibleHeight+1, `${screen}: ${JSON.stringify(bounds)}`);
     await page.screenshot({path:`/tmp/uodekka-${screen}-${width}-${visibleHeight}.png`});
   }
 }
 console.log('PASS: 横持ちiPhone 16・Pixel 9相当のホーム/シングル、表示領域縮小時の主要ボタン到達性');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
