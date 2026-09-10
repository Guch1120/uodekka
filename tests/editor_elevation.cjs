const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/browser-tests/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL || 'http://localhost:8099');
 await page.click('#title-screen'); await page.waitForFunction(()=>!!window.gameInstance);
 await page.click('#tab-editor');
 await page.waitForSelector('#editor-preview canvas');
 await page.click('[data-view="plan"]');
 const before=await page.evaluate(()=>gameInstance.editorModal.courseData.points.map(p=>[p.x,p.z]));
 await page.selectOption('#editor-point',{value:'2'});
 await page.fill('#editor-height','45'); await page.locator('#editor-height').press('Tab');
 await page.click('[data-view="height"]');
 const point=await page.evaluate(()=>{const e=gameInstance.editorModal,p=e.profileLayout(),r=e.canvas.getBoundingClientRect();return {x:r.left+p.x(p.distances[2]),y:r.top+p.y(45)}});
 await page.mouse.move(point.x,point.y); await page.mouse.down(); await page.mouse.move(point.x+25,point.y-30); await page.mouse.up();
 assert.deepEqual(await page.evaluate(()=>gameInstance.editorModal.courseData.points.map(p=>[p.x,p.z])),before);
 assert((await page.evaluate(()=>gameInstance.editorModal.courseData.points[2].y))>45);
 await page.click('#editor-undo');
 assert.equal(await page.evaluate(()=>gameInstance.editorModal.courseData.points[2].y),45);
 await page.click('#editor-flatten');assert.equal(await page.evaluate(()=>Math.max(...gameInstance.editorModal.courseData.points.map(p=>p.y))),0);
 await page.click('#editor-undo');
 await page.screenshot({path:'/tmp/editor-height.png'});
 await page.click('#btn-editor-save');
 const id=await page.evaluate(()=>gameInstance.editorModal.courseData.id);
 await page.click('#editor-flatten');
 await page.locator('.editor-options summary').click();
 await page.selectOption('#editor-saved',id);await page.click('#editor-load');await page.locator('.editor-options summary').click();
 assert.equal(await page.evaluate(()=>gameInstance.editorModal.courseData.points[2].y),45);
 const geometry=await page.evaluate(async()=>{
  const {courseCurve,elevationProfile}=await import('/frontend/courses/course_curve.js');
  const data=gameInstance.editorModal.courseData, curve=courseCurve(data);
  const {Courses}=await import('/frontend/courses/index.js');
  const saved=JSON.parse(localStorage.getItem('kart_custom_courses'));
  saved.custom_legacy={...data,id:'custom_legacy',points:data.points.map(({x,z})=>({x,z}))};
  localStorage.setItem('kart_custom_courses',JSON.stringify(saved));
  const legacy=Courses.getCourse('custom_legacy').points.every(p=>p.y===0);
  const flat=courseCurve({...data,points:data.points.map(p=>({...p,y:0}))});
  let planError=0;
  for(let i=0;i<=100;i++){const a=curve.getPoint(i/100),b=flat.getPoint(i/100);planError=Math.max(planError,Math.hypot(a.x-b.x,a.z-b.z));}
  return {legacy,planError,seam:curve.getPoint(0).distanceTo(curve.getPoint(1)),tangent:curve.getTangent(0).dot(curve.getTangent(1)),profile:elevationProfile(data.points).distances.length};
 });
 assert(geometry.legacy);assert(geometry.planError<1e-8);assert(geometry.seam<1e-8);assert(geometry.tangent>0.999);assert.equal(geometry.profile,before.length+1);
 await page.click('[data-view="preview"]');
 const distance=await page.evaluate(()=>gameInstance.editorModal.preview.distance);
 await page.locator('#editor-preview').hover();await page.mouse.wheel(0,-100);
 assert((await page.evaluate(()=>gameInstance.editorModal.preview.distance))<distance);
 await page.screenshot({path:'/tmp/editor-3d.png'});
 await page.click('#btn-editor-test');await page.waitForFunction(()=>gameInstance.isRunning);
 const result=await page.evaluate(()=>{
  const g=gameInstance,curve=g.courseTrack.curve,k=g.localPlayerKart;
  g.isPaused=true;
  let maxError=0,minUp=1;
  const THREE=k.mesh.position.constructor; // use the existing Vector3 constructor
  for(let i=1;i<100;i++){
   const t=i/100, p=curve.getPointAt(t), tangent=curve.getTangentAt(t);
   k.position.copy(p);k.mesh.rotation.set(0,Math.atan2(-tangent.x,-tangent.z),0,'YXZ');
   k.alignToTrack(curve,t);
   maxError=Math.max(maxError,Math.abs(k.position.y-p.y-0.35));
   minUp=Math.min(minUp,new THREE(0,1,0).applyQuaternion(k.mesh.quaternion).y);
  }
  let aiMax=0;
  for(let i=0;i<1200;i++){
   for(const entry of g.otherPlayers.values()){
    g.updateAIPlayer(entry,1/60);
    aiMax=Math.max(aiMax,entry.physics.position.y);
   }
  }
  return {maxError,minUp,aiMax,course:g.currentGameConfig.courseId};
 });
 assert(result.maxError<1e-6);assert(result.minUp>0.5);assert(result.aiMax>10);assert.equal(result.course,id);
 await page.evaluate(()=>gameInstance.quitRace());
 await page.click('#tab-solo');
 const updateConfirmBtn = await page.$('#btn-update-confirm');
 if (updateConfirmBtn) {
   await updateConfirmBtn.click();
   await page.waitForSelector('#update-modal', { state: 'hidden', timeout: 5000 });
 }
 await page.waitForSelector('[data-screen="solo"]:not([hidden])', { timeout: 5000 });
 assert(await page.evaluate(id=>gameInstance.lobbyModal.courseIds.includes(id),id));
 await page.click('#garage-back'); await page.click('#tab-editor');
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);await page.click('[data-view="height"]');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert(await page.evaluate(()=>{const el=document.querySelector('.editor-dialog');return el.scrollWidth<=el.clientWidth+1}));
  await page.screenshot({path:'/tmp/editor-'+size.width+'.png'});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: height drag, unchanged plan, undo/flatten, save/reload, seam, 3D, race contact, CPU climbing, solo selection, mobile layout');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
