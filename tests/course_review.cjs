const { chromium } = require('/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
const artifactDir = process.env.REVIEW_ARTIFACT_DIR || '/tmp';
require('node:fs').mkdirSync(artifactDir, {recursive:true});
(async () => {
  const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:8099');
  await page.evaluate(async()=>{
    const {UPDATE_NOTIFICATION}=await import('./frontend/data/updates.js');
    localStorage.setItem('kart_last_read_update_version', UPDATE_NOTIFICATION.version);
  });
  await page.click('#title-screen');
  await page.waitForFunction(()=>!!window.gameInstance);
  await page.click('#tab-solo');
  await page.waitForSelector('[data-screen="solo"]:not([hidden])');
  assert.equal(await page.locator('#course-select option').count(),7);
  const summary=[];
  for(let i=1;i<=7;i++) {
    await page.selectOption('#course-select','course'+i);
    assert.equal(await page.evaluate(()=>gameInstance.lobbyModal.courseIndex),i-1);
    assert.equal(await page.locator('[data-course-direction]').count(),3);
    summary.push(await page.locator('#course-metrics').innerText());
    await page.click('#course-confirm');
    await page.click('#btn-start-solo');
    await page.waitForFunction(()=>gameInstance.isRunning);
    await page.evaluate(()=>{gameInstance.isPaused=true;});
    await page.screenshot({path:artifactDir+'/uodekka-course-'+i+'.png'});
    await page.evaluate(()=>gameInstance.quitRace());
    await page.click('#tab-solo');
  }
  await page.selectOption('#course-select','course2');
  await page.click('#course-confirm');
  await page.selectOption('#course-select','course7');
  assert.match(await page.locator('#course-confirmation').innerText(),/閲覧中/);
  assert.equal(await page.evaluate(()=>gameInstance.lobbyModal.confirmedCourse),'course2');
  for(const size of [{width:1280,height:800},{width:844,height:390},{width:390,height:844},{width:667,height:375}]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    await page.screenshot({path:artifactDir+'/uodekka-select-'+size.width+'.png'});
    // 縦画面はスクロールも含め、主要操作に到達できることを確認する。
    for(const selector of ['#course-select','#course-confirm','#btn-start-solo']) {
      await page.locator(selector).click({trial:true});
      const box=await page.locator(selector).boundingBox();
      assert.ok(box && box.x>=-1 && box.y>=-1 && box.x+box.width<=size.width+1 && box.y+box.height<=size.height+1, selector+' '+JSON.stringify({size,box}));
    }
  }
  await page.setViewportSize({width:1280,height:800});
  await page.evaluate(()=>{
    localStorage.setItem('kart_custom_courses',JSON.stringify({custom_review:{id:'custom_review',name:'高さテスト',points:[{x:0,y:0,z:0},{x:100,y:20,z:0},{x:100,y:0,z:100},{x:0,y:0,z:100}],jumpRamps:[]}}));
    gameInstance.lobbyModal.refreshCourses();
  });
  await page.selectOption('#course-select','custom_review');
  assert.match(await page.locator('#course-metrics').innerText(),/20 m/);
  assert.match(await page.locator('#course-metrics').innerText(),/0 か所/);
  assert.deepEqual(errors,[]);
  console.log('PASS: 7コース起動、一覧選択、確定保持、矢印、4画面寸法の操作到達、カスタム高低差、ブラウザ例外0件');
  console.log(JSON.stringify(summary));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
