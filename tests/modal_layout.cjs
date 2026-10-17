const {chromium}=require('/opt/browser-tests/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:393,height:793},hasTouch:true});
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;Element.prototype.webkitRequestFullscreen=undefined;});
 await page.goto(process.env.GAME_URL||'http://localhost:8099');await page.click('#title-screen');await page.waitForFunction(()=>!!window.gameInstance);
 const fits=async selector=>{
  const bounds=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),a=document.querySelector('#app').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,appLeft:a.left,appTop:a.top,appRight:a.right,appBottom:a.bottom};});
  assert.ok(bounds.left>=bounds.appLeft-1&&bounds.top>=bounds.appTop-1&&bounds.right<=bounds.appRight+1&&bounds.bottom<=bounds.appBottom+1,selector+': '+JSON.stringify(bounds));
 };
 for(const size of [{width:393,height:793},{width:852,height:393},{width:915,height:412},{width:852,height:393,visibleHeight:330}]){
  await page.setViewportSize({width:size.width,height:size.height});
  await page.waitForFunction(size=>deviceInfo.viewportWidth===size.width&&deviceInfo.viewportHeight===size.height,size);
  if(size.visibleHeight) await page.evaluate(h=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:h});visualViewport.dispatchEvent(new Event('resize'));},size.visibleHeight);
  await page.evaluate(()=>gameInstance.settingsModal.show());
  await fits('#settings-modal .modal-dialog');await fits('#settings-modal .modal-header');
  await page.locator('#settings-modal .btn-close').click();
  await page.evaluate(()=>gameInstance.lobbyModal.feedbackModal.show());
  await page.locator('#feedback-image').setInputFiles(Array.from({length:5},(_,i)=>({name:`test-${i}.png`,mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')})));
  await page.evaluate(()=>document.querySelector('.feedback-privacy').open=true);
  await fits('#feedback-modal .modal-dialog');await fits('#btn-send-feedback');
  await page.locator('#feedback-steps').scrollIntoViewIfNeeded();await fits('#feedback-steps');
  await page.evaluate(()=>gameInstance.lobbyModal.feedbackModal.hide());
  await page.evaluate(async()=>{
   const {ResultModal}=await import('/frontend/ui/result_modal.js');
   window.testResult=new ResultModal(document.querySelector('#app'),{rank:2,courseName:'検証用コース',totalTime:59601,lapTimes:[20410,19753,19438],coinsEarned:11,bankCoins:13,
    racers:Array.from({length:12},(_,i)=>({name:`CPU ${i+1}`,isLocal:i===1,totalTime:59601+i*100}))});
  });
  await fits('.result-modal-card');await page.locator('#btn-result-home').scrollIntoViewIfNeeded();await fits('#btn-result-home');
  await page.screenshot({path:`/tmp/uodekka-result-${size.width}.png`});
  await page.evaluate(()=>testResult.destroy());
 }
 console.log('PASS: 設定・リザルトのモーダルと終了操作がCSS回転/実横画面の表示領域内に収まる');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
