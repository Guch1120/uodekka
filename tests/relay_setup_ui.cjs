const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:8100');
  await page.click('#title-screen');await page.waitForFunction(()=>!!window.gameInstance);
  await page.click('#tab-join');await page.fill('#input-room-id','relay-test');
  // Exercise the real config preflight, keeping signaling pending to avoid external networking.
  await page.evaluate(()=>{gameInstance.p2p.initPeer=()=>new Promise(()=>{});});
  await page.click('#room-submit');
  // initPeer normally reports signaling after the real preflight completes.
  await page.waitForFunction(()=>!!gameInstance.p2p.networkConfig);
  await page.evaluate(()=>gameInstance.p2p.report('signaling','接続案内サーバーに接続しています…'));
  const guide=page.locator('#relay-setup-dialog');await guide.waitFor({state:'visible'});
  assert.match(await page.locator('#relay-setup-status').textContent(),/未設定/);
  assert.match(await guide.textContent(),/ゲスト一人ひとりが作る必要はありません/);
  assert(await page.locator('#room-submit').isDisabled());
  await page.screenshot({path:'/tmp/relay-setup-mobile.png'});
  assert(await guide.evaluate(el=>el.getBoundingClientRect().left>=0 && el.getBoundingClientRect().right<=innerWidth && el.clientHeight<=innerHeight));
  await guide.locator('[data-close]').first().click();
  await page.evaluate(()=>gameInstance.p2p.report('retrying','再試行中'));
  assert.equal(await guide.isVisible(),false);
  assert(await page.evaluate(()=>gameInstance.lobbyModal.busy));
  await page.locator('#room-dialog [data-relay-help]').click();
  await page.route('**/api/ice-servers',route=>route.fulfill({status:503,body:'{}'}));
  await page.click('#relay-recheck');await page.waitForFunction(()=>document.querySelector('#relay-setup-status').textContent.includes('未作成とは限りません'));
  await page.unroute('**/api/ice-servers');
  await page.route('**/api/ice-servers',route=>route.fulfill({json:{iceServers:[{urls:'turn:example.com:3478',username:'test-user',credential:'test-secret'}]}}));
  await page.click('#relay-recheck');await page.waitForFunction(()=>document.querySelector('#relay-setup-status').textContent.includes('取得できました'));
  assert(!(await guide.textContent()).includes('test-secret'));
  await page.keyboard.press('Escape');assert.equal(await guide.isVisible(),false);
  assert(await page.locator('#room-dialog').isVisible());
  await page.click('#room-dialog-close');await page.waitForFunction(()=>!gameInstance.lobbyModal.busy);
  await page.evaluate(()=>{ const lobby=gameInstance.lobbyModal; lobby.busy=true;lobby.connectionAttempt++;gameInstance.p2p.networkConfig={relayConfigured:true};gameInstance.p2p.report('signaling','接続中'); });
  assert.equal(await guide.isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile guide, missing config auto-open, no repeat on retry, connection preserved, manual reopen, API failure distinction, recheck, credential redaction, Escape, configured no popup');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
