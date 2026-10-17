const {chromium}=require('/opt/browser-tests/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('kart_unlocked_skills',JSON.stringify({standard_red:true,speed_blue:true,handling_green:true,heavy_yellow:true})));
 await page.goto(process.env.GAME_URL||'http://localhost:8099');await page.click('#title-screen');
 await page.waitForFunction(()=>!!window.gameInstance);
 await page.click('#tab-solo');if(await page.locator('#btn-update-confirm').isVisible())await page.click('#btn-update-confirm');
 await page.click('#course-confirm');await page.click('#btn-start-solo');await page.waitForFunction(()=>gameInstance.isRunning);
 const result=await page.evaluate(()=>{
  const g=gameInstance,k=g.localPlayerKart;
  window.placeKart=(kart,t,offset=0)=>{const f=g.trackEffectsView.frame(t,offset);kart.mesh.position.copy(f.position);kart.mesh.position.y+=.4;kart.progress=t;kart.currentLap=1;kart.speed=25;kart.isAirborne=false;kart.isGliding=false;kart.isRespawning=false;};
  placeKart(k,.12,2);g.playerSkillState.cooldown=0;g.triggerPlayerSkill();g.isPaused=true;
  const created=g.trackEffects.traces.length; k.boostTimer=0;k.isAirborne=false;
  placeKart(k,.11,2);g.updateTrackEffects(1/60);placeKart(k,.12,2);g.updateTrackEffects(1/60);const inside=k.boostTimer;
  placeKart(k,.13,2);g.updateTrackEffects(1/60);const exit=k.boostTimer;
  const gate=g.trackEffects.gates[0];g.playerSkillState.cooldown=10;
  placeKart(k,gate.t-.008,gate.offset);g.updateTrackEffects(1/60);placeKart(k,gate.t+.004,gate.offset);g.updateTrackEffects(1/60);
  g.hud.updateSkill(g.playerSkillState.cooldown,14,false);
  const f=g.trackEffectsView.frame(gate.t,gate.offset);g.renderer.camera.position.copy(f.position).addScaledVector(f.forward,-20);g.renderer.camera.position.y+=12;g.renderer.camera.lookAt(f.position);g.renderer.render();
  return {created,inside,exit,recovered:g.playerSkillState.cooldown,particles:document.querySelectorAll('.skill-recovery-particle').length,cd:document.querySelector('#hud-skill-cd').textContent,gates:g.trackEffectsView.gateMeshes.length};
 });
 assert.equal(result.created,1);assert.equal(result.inside,0);assert.ok(result.exit>0);assert.equal(result.recovered,6);assert.equal(result.particles,5);assert.equal(result.cd,'6s');assert.equal(result.gates,3);
 console.log('PASS: 固有スキルの実発動→痕跡生成→退出加速、回復ゲート→CD短縮→HUDへの粒子演出');
 await page.screenshot({path:'/tmp/uodekka-track-recovery.png'});
 await page.waitForTimeout(900);assert.equal(await page.locator('.skill-recovery-particle').count(),0);
 const cpu=await page.evaluate(async()=>{
  const {createSkillState}=await import('/backend/skills/unique_skills.js');const {Vehicles}=await import('/frontend/vehicles/vehicles.js');
  const g=gameInstance,p=[...g.otherPlayers.values()].find(p=>p.isAI);
  const key=p.personality.vehicleKey;p.skillState=createSkillState(key,true);placeKart(p.physics,.4,3);
  const before=g.trackEffects.traces.length;g.activateRacerSkill(p.physics,p.skillState,Vehicles.types[key].skill,p.missionTracker);
  const gate=g.trackEffects.gates[0];const probe={progress:gate.t-.02};
  return {created:g.trackEffects.traces.length-before,straight:g.getTrackEffectTarget(probe,{cooldown:12},0,'line_master'),recovery:g.getTrackEffectTarget(probe,{cooldown:12},0,'defender'),offset:gate.offset};
 });
 assert.equal(cpu.created,1);assert.equal(cpu.straight,0);assert.equal(cpu.recovery,cpu.offset);
 console.log('PASS: CPUも同じ発動・痕跡処理を使用し、個性により回復ゲートへの進路が異なる');
 const resources=await page.evaluate(()=>{
  const g=gameInstance;g.trackEffects.elapsed=59;g.trackEffectsView.update();const entry=g.trackEffectsView.traceMeshes.values().next().value;
  const fading=entry.material.opacity;let disposed=0,instancesDisposed=0;entry.strips.addEventListener('dispose',()=>instancesDisposed++);entry.group.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));
  g.trackEffects.elapsed=100;g.trackEffects.update(.1);g.trackEffectsView.update();
  const expired=g.trackEffectsView.traceMeshes.size;const root=g.trackEffectsView.root;
  g.restartRace();return {fading,disposed,instancesDisposed,expired,detached:root.parent===null,traces:g.trackEffects.traces.length};
 });
 assert.ok(resources.fading>0&&resources.fading<.2);assert.ok(resources.disposed>0);assert.equal(resources.instancesDisposed,1);assert.equal(resources.expired,0);assert.equal(resources.detached,true);assert.equal(resources.traces,0);
 assert.deepEqual(errors,[]);console.log('PASS: 寿命末期のフェード、期限切れ・リスタート時の描画資源解放、ブラウザ例外0件');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
