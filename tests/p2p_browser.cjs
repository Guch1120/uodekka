const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const pages=[],errors=[];
 const base=process.env.GAME_URL || 'http://localhost:8100';
 try {
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:i===0?{width:1280,height:800}:{width:844,height:390}});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   if (process.env.FORCE_RELAY === '1') await page.addInitScript(() => {
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(config, ...rest) { super({...config, iceTransportPolicy:'relay'}, ...rest); }
    };
   });
   await page.goto(base);await page.click('#title-screen');await page.waitForFunction(()=>!!window.gameInstance);
   await page.fill('#player-name',i===0?'検証ホスト':'検証ゲスト');
  }
  const [host,guest]=pages,room='check-'+Date.now().toString(36);
  await host.click('#tab-create');await host.fill('#input-room-id',room);await host.click('#room-submit');
  await host.locator('[data-screen="room"]').waitFor({state:'visible',timeout:25000});
  await guest.click('#tab-join');await guest.fill('#input-room-id',room);await guest.click('#room-submit');
  await guest.locator('[data-screen="room"]').waitFor({state:'visible',timeout:90000});
  for (const page of pages) if (await page.locator('#relay-setup-dialog').isVisible()) await page.locator('#relay-setup-dialog [data-close]').first().click();
  assert.equal(await host.locator('#players-list .garage-member').count(),2);
  assert.equal(await guest.locator('#players-list .garage-member').count(),2);
  assert(await guest.locator('#room-random').isDisabled());
  assert(await guest.locator('#btn-host-start').isDisabled());
  await host.click('#room-random');
  await guest.waitForFunction(()=>!!gameInstance.p2p.courseId);
  assert.equal(await host.locator('#room-course-name').textContent(),await guest.locator('#room-course-name').textContent());
  if (process.env.FORCE_RELAY === '1') {
   await guest.waitForFunction(()=>gameInstance.p2p.diagnostics.some(e=>e.event==='selected-route' && e.relay===true));
  }
  const diagnostic=await guest.evaluate(()=>gameInstance.p2p.getDiagnostics());
  assert(diagnostic.includes('connected'));assert(!diagnostic.includes(room));
  assert(!diagnostic.includes('credential'));assert(!diagnostic.includes('uodekka-'));
  await guest.screenshot({path:'/tmp/p2p-room-mobile.png',fullPage:true});
  await guest.click('#garage-back');await guest.click('#tab-join');await guest.fill('#input-room-id','missing-'+Date.now().toString(36));await guest.click('#room-submit');
  await guest.waitForFunction(()=>document.querySelector('#room-dialog-status').textContent.includes('見つかりません'),undefined,{timeout:25000});
  assert(await guest.locator('#room-submit').isEnabled());
  assert.equal(await guest.locator('#input-room-id').getAttribute('readonly'),null);
  await guest.screenshot({path:'/tmp/p2p-error-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: real PeerJS signaling and direct WebRTC, room membership, host permissions, shared course, diagnostics redaction, missing-room recovery, mobile UI');
 } finally {
  for(const p of pages)await p.evaluate(()=>window.gameInstance?.p2p.leaveRoom()).catch(()=>{});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
