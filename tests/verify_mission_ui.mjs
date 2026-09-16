// tests/verify_mission_ui.mjs
// M4検証用: ミッション形式スキルアップシステムのガレージ・HUD・リザルト表示を実ブラウザで確認する。
// tests/smoke.cjs と同じ Docker/Playwright 環境（/opt/browser-tests/node_modules/playwright）を使用する。
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/browser-tests/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  await page.goto(process.env.GAME_URL || 'http://localhost:8099');
  await page.click('#title-screen');
  await page.waitForFunction(() => !!window.gameInstance, { timeout: 60000 });

  // 1. ガレージ: ミッションチップから詳細モーダルを開くと車体別3ミッションが表示される
  await page.click('#btn-show-missions');
  await page.waitForSelector('#garage-mission-modal', { timeout: 3000 });
  const garageMissions = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.mission-info-item'));
    return {
      count: items.length,
      names: items.map(el => el.querySelector('strong')?.textContent || ''),
      note: document.querySelector('.mission-info-modal-card .mission-info-note:last-of-type')?.textContent || ''
    };
  });
  assert.equal(garageMissions.count, 3, 'mission modal should list exactly 3 missions for the initial vehicle');
  assert.ok(garageMissions.note.includes('Lv.5'), 'mission modal note should mention the Lv.5 CPU gating condition');
  console.log('PASS: ガレージのミッションモーダルに車体別3ミッションが表示される (' + garageMissions.names.join(' / ') + ')');
  await page.click('#btn-close-mission-modal');
  await page.waitForSelector('#garage-mission-modal', { state: 'detached', timeout: 3000 });

  // 2. 車体切替でミッション一覧が切り替わる
  await page.click('#vehicle-next');
  await page.click('#btn-show-missions');
  await page.waitForSelector('#garage-mission-modal', { timeout: 3000 });
  const garageMissions2 = await page.evaluate(() => Array.from(document.querySelectorAll('.mission-info-item strong')).map(el => el.textContent));
  assert.notDeepEqual(garageMissions2, garageMissions.names, 'switching vehicle should switch the displayed mission list');
  console.log('PASS: 車体切替でミッション一覧が切り替わる (' + garageMissions2.join(' / ') + ')');
  await page.click('#btn-close-mission-modal');
  await page.waitForSelector('#garage-mission-modal', { state: 'detached', timeout: 3000 });
  await page.click('#vehicle-prev'); // 元の車体（レッド）に戻す

  // 3. ソロレース開始
  await page.click('#tab-solo');
  const updateConfirmBtn = await page.$('#btn-update-confirm');
  if (updateConfirmBtn) {
    await updateConfirmBtn.click();
    await page.waitForSelector('#update-modal', { state: 'hidden', timeout: 5000 });
  }
  await page.waitForSelector('[data-screen="solo"]:not([hidden])', { timeout: 5000 });
  await page.click('#course-confirm');
  await page.click('#btn-start-solo');
  await page.waitForFunction(() => window.gameInstance.isRunning, { timeout: 15000 });

  // 4. ミッション抽選: プレイヤーに missionTracker が割り当てられている
  const drawnMission = await page.evaluate(() => {
    const t = gameInstance.playerMissionTracker;
    return t ? { missionId: t.missionId, name: t.missionDef?.name, thresholds: t.missionDef?.thresholds } : null;
  });
  assert.ok(drawnMission && drawnMission.missionId, 'a mission should be drawn for the player at race start');
  console.log(`PASS: ミッション抽選 (${drawnMission.name})`);

  // 5. HUDミッショントラッカーが数フレーム後に表示される
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  const hudVisible = await page.evaluate(() => {
    const el = document.querySelector('#hud-mission-tracker');
    return el && !el.classList.contains('hidden') && document.querySelector('#hud-mission-name').textContent;
  });
  assert.ok(hudVisible, 'HUD mission tracker should be visible and show the mission name during the race');
  console.log(`PASS: HUDミッショントラッカー表示 (${hudVisible})`);

  // 6. 段階達成をシミュレートし、進捗確定→通知が一度きり表示されることを確認
  await page.evaluate(() => { gameInstance.playerMissionTracker.addProgress(99999); });
  await page.waitForFunction(() => {
    const el = document.querySelector('#hud-mission-reveal');
    return el && !el.classList.contains('hidden');
  }, { timeout: 3000 });
  const revealTitle = await page.evaluate(() => document.querySelector('#mission-reveal-title')?.textContent || '');
  assert.ok(revealTitle.includes('達成'), 'mission stage-clear reveal should show an achievement title');
  const stageAfterForce = await page.evaluate(() => gameInstance.playerMissionTracker.stage);
  assert.equal(stageAfterForce, 3, 'forcing a huge progress jump should cap at the final stage (3)');
  console.log(`PASS: 段階達成の非ブロッキング通知 (${revealTitle})`);

  // 7. ゴールしてリザルト画面にミッションサマリーが表示されることを確認
  await page.evaluate(() => {
    gameInstance.localPlayerKart.currentLap = gameInstance.currentCourseConfig.totalLaps + 1;
  });
  await page.waitForSelector('#race-result-modal', { timeout: 10000 });
  await page.waitForFunction(() => !!document.querySelector('.result-mission-summary'), { timeout: 5000 });
  const resultSummary = await page.evaluate(() => ({
    text: document.querySelector('.result-mission-summary')?.textContent || '',
    filledPips: document.querySelectorAll('.result-mission-summary .mission-summary-stage-pips .mission-pip.filled').length
  }));
  assert.ok(resultSummary.text.includes(drawnMission.name), 'result screen mission summary should show the drawn mission name');
  assert.ok(resultSummary.text.includes('達成数 3/3'), 'result screen should reflect the forced stage-3 achievement');
  assert.equal(resultSummary.filledPips, 3, 'result screen should show 3 filled stage pips');
  console.log('PASS: リザルト画面にミッション達成サマリーが表示される');

  await page.screenshot({ path: 'tests/tmp_mission_ui_result.png' });

  assert.deepEqual(errors, [], 'no uncaught browser exceptions should occur: ' + JSON.stringify(errors));
  console.log('PASS: ブラウザ例外0件');

  await browser.close();
  console.log('');
  console.log('ALL MISSION UI VERIFICATION CHECKS PASSED!');
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
