// tests/multiplayer_devices.mjs
// マルチデバイス風マルチプレイ検証: 実機複数台の代わりに、独立したブラウザプロセス2つ
// (別Cookie/localStorage = 別デバイス相当) を、ローカルで動かしたWorker(wrangler dev)経由の
// 同一ルームへ接続させ、ミッション形式スキルアップシステムのホスト/ゲスト間同期を検証する。
// 本番のCloudflare WorkerやCookie/localStorageを共有しないため、実機複数台での検証にかなり近い
// テストになる（tests/smoke.cjs 等と同じ Docker/Playwright 環境で実行する）。
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/browser-tests/node_modules/playwright');

const print = console.log;
const GAME_URL = process.env.GAME_URL || 'http://localhost:8099';
const SERVER_PORT = process.env.PORT || 8099;
const WORKER_PORT = 8787;
const MULTIPLAYER_URL = `ws://127.0.0.1:${WORKER_PORT}/ws`;

function waitFor(fn, { timeout = 15000, interval = 250, message = 'condition' } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      let ok;
      try { ok = await fn(); } catch { ok = false; }
      if (ok) return resolve();
      if (Date.now() - start > timeout) return reject(new Error(`Timed out waiting for: ${message}`));
      setTimeout(tick, interval);
    };
    tick();
  });
}

function waitForHttpReady(url, { timeout = 20000, interval = 500 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() - start > timeout) return reject(new Error(`サーバーが起動しませんでした: ${url}`));
        setTimeout(tick, interval);
      });
    };
    tick();
  });
}

function killProcessGroup(child) {
  if (!child || child.killed) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
}

async function setupClient(browser, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(`[${label}] ${e.message}`));

  // index.html は window.MULTIPLAYER_SERVER_URL が未設定の場合のみ本番エンドポイントを設定するため、
  // ナビゲーション前にこのスクリプトでローカルWorkerへ差し替える（ソースコード変更不要）。
  await page.addInitScript((url) => { window.MULTIPLAYER_SERVER_URL = url; }, MULTIPLAYER_URL);

  await page.goto(GAME_URL);
  await page.click('#title-screen');
  await page.waitForFunction(() => !!window.gameInstance, { timeout: 30000 });

  return { page, errors };
}

// 更新情報モーダルは初回のホーム画面遷移操作（tab-create/tab-join/tab-solo等のクリック）の
// 直後に初めて出現する仕様のため、画面遷移クリックのあとに毎回呼び出す。
async function dismissUpdateModalIfPresent(page) {
  const updateBtn = await page.$('#btn-update-confirm');
  if (updateBtn) {
    await updateBtn.click();
    await page.waitForSelector('#update-modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

(async () => {
  print('local server + local worker を起動しています...');
  const serverChild = spawn('node', ['tests/server.cjs'], {
    env: { ...process.env, PORT: String(SERVER_PORT) },
    detached: true,
    stdio: 'ignore'
  });
  const workerChild = spawn('npx', ['wrangler', 'dev', '--port', String(WORKER_PORT), '--ip', '127.0.0.1'], {
    detached: true,
    stdio: 'ignore'
  });

  let hostBrowser = null;
  let guestBrowser = null;

  try {
    await waitForHttpReady(GAME_URL, { timeout: 20000 });
    await waitForHttpReady(`http://127.0.0.1:${WORKER_PORT}/`, { timeout: 25000 });
    print('PASS: static server と local worker が起動した');

    // 1. 実機2台相当: 完全に独立したブラウザプロセスを2つ起動する
    hostBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    guestBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

    const host = await setupClient(hostBrowser, 'HOST');
    const guest = await setupClient(guestBrowser, 'GUEST');
    print('PASS: ホスト・ゲストそれぞれ独立したブラウザでガレージに到達した');

    // 2. 車体を変える（ホストは既定のレッド、ゲストはブルーへ切替）
    await guest.page.click('#vehicle-next');

    // 3. ホスト: ルーム作成
    const roomId = `mp-test-${Date.now() % 1000000}`;
    await host.page.click('#tab-create');
    await dismissUpdateModalIfPresent(host.page);
    await host.page.fill('#input-room-id', roomId);
    await host.page.click('#room-submit');
    await waitFor(() => host.page.evaluate(() => !!window.gameInstance?.p2p?.roomId), { timeout: 15000, message: 'ホストのルーム作成完了' });
    print(`PASS: ホストがルーム作成 (roomId=${roomId})`);

    // 4. ゲスト: 同じルームIDで参加
    await guest.page.click('#tab-join');
    await dismissUpdateModalIfPresent(guest.page);
    await guest.page.fill('#input-room-id', roomId);
    await guest.page.click('#room-submit');
    await waitFor(() => guest.page.evaluate(() => !!window.gameInstance?.p2p?.roomId), { timeout: 15000, message: 'ゲストのルーム参加完了' });
    print('PASS: ゲストが同一ルームへ参加');

    // 5. 双方で2人揃うまで待つ（ホスト・ゲストの2クライアントが独立したWebSocket接続で同期）
    await waitFor(() => host.page.evaluate(() => window.gameInstance?.p2p?.members?.length === 2), { timeout: 15000, message: 'ホスト側でメンバー2人確認' });
    await waitFor(() => guest.page.evaluate(() => window.gameInstance?.p2p?.members?.length === 2), { timeout: 15000, message: 'ゲスト側でメンバー2人確認' });
    print('PASS: ホスト・ゲスト双方がルームメンバー2人を確認（独立接続でのルーム状態同期）');

    // 6. ホスト: コース決定 → レース開始
    await host.page.click('#room-random');
    await waitFor(() => host.page.evaluate(() => !document.querySelector('#btn-host-start').disabled), { timeout: 10000, message: 'コース決定によるゲーム開始ボタン有効化' });
    await host.page.click('#btn-host-start');

    await waitFor(() => host.page.evaluate(() => window.gameInstance?.isRunning === true), { timeout: 25000, message: 'ホスト側レース開始' });
    await waitFor(() => guest.page.evaluate(() => window.gameInstance?.isRunning === true), { timeout: 25000, message: 'ゲスト側レース開始' });
    print('PASS: ホスト・ゲスト双方でレースが開始した');

    // 7. ミッション形式スキルアップシステム: ホストが確定したcpuLevel・ミッション抽選が
    //    エコーされたSTART_RACEを通じて両クライアントで完全一致することを検証する
    //    （これは2つの本当に独立したWebSocket接続がないと検出できない類の不具合）
    const [hostCpuLevel, guestCpuLevel] = await Promise.all([
      host.page.evaluate(() => window.gameInstance.frozenCpuLevel),
      guest.page.evaluate(() => window.gameInstance.frozenCpuLevel)
    ]);
    assert.equal(hostCpuLevel, guestCpuLevel, `frozenCpuLevelがホスト(${hostCpuLevel})とゲスト(${guestCpuLevel})で一致しない`);
    print(`PASS: frozenCpuLevelがホスト・ゲストで一致 (Lv.${hostCpuLevel})`);

    const [hostAssignments, guestAssignments] = await Promise.all([
      host.page.evaluate(() => window.gameInstance.currentGameConfig?.missionAssignments || null),
      guest.page.evaluate(() => window.gameInstance.currentGameConfig?.missionAssignments || null)
    ]);
    assert.ok(hostAssignments, 'ホストのcurrentGameConfig.missionAssignmentsが取得できない');
    assert.ok(guestAssignments, 'ゲストのcurrentGameConfig.missionAssignmentsが取得できない');
    assert.deepEqual(hostAssignments, guestAssignments, 'missionAssignmentsがホストとゲストで一致しない（マルチプレイ同期のバグ）');
    print(`PASS: missionAssignmentsがホスト・ゲストで完全一致 (${Object.keys(hostAssignments).length}人分)`);

    const [hostMissionId, guestMissionId] = await Promise.all([
      host.page.evaluate(() => window.gameInstance.playerMissionTracker?.missionId || null),
      guest.page.evaluate(() => window.gameInstance.playerMissionTracker?.missionId || null)
    ]);
    assert.ok(hostMissionId, 'ホストにミッションが抽選されていない');
    assert.ok(guestMissionId, 'ゲストにミッションが抽選されていない');
    print(`PASS: 各クライアントに自身のミッションが抽選済み (host=${hostMissionId}, guest=${guestMissionId})`);

    // 8. KART_STATE: ホストを走らせ、ゲスト側で「ホストのカート」の位置が実際に変化することを確認する
    //    （otherPlayers のうち id が 'ai_' で始まらないものがホスト/人間ピア。CPUは 'ai_0'..'ai_10' 形式）
    await host.page.keyboard.down('w');
    const posAt = async (page) => page.evaluate(() => {
      const peer = Array.from(window.gameInstance.otherPlayers.entries()).find(([id]) => !id.startsWith('ai_'));
      return peer ? { x: peer[1].mesh.position.x, z: peer[1].mesh.position.z } : null;
    });
    const guestViewOfHost1 = await posAt(guest.page);
    await new Promise(r => setTimeout(r, 900));
    const guestViewOfHost2 = await posAt(guest.page);
    await host.page.keyboard.up('w');
    assert.ok(guestViewOfHost1, 'ゲスト側でホストのカートのotherPlayersエントリが見つからない');
    assert.ok(guestViewOfHost2, 'ゲスト側でホストのカートのotherPlayersエントリが見つからない（2回目）');
    const hostMoved = Math.hypot(guestViewOfHost2.x - guestViewOfHost1.x, guestViewOfHost2.z - guestViewOfHost1.z) > 0.5;
    assert.ok(hostMoved, `ゲストから見たホストの位置が変化していない（KART_STATE同期の疑い）: ${JSON.stringify(guestViewOfHost1)} -> ${JSON.stringify(guestViewOfHost2)}`);
    print('PASS: ホストの走行がKART_STATE経由でゲスト側に実時間で反映される');

    // 9. CPU_STATES: ホストがローカルシミュレートするCPUの位置が、ゲスト側でも実際に動いていることを確認する
    const cpuPosAt = async (page) => page.evaluate(() => {
      const cpu = Array.from(window.gameInstance.otherPlayers.entries()).find(([id]) => id.startsWith('ai_'));
      return cpu ? { id: cpu[0], x: cpu[1].mesh.position.x, z: cpu[1].mesh.position.z } : null;
    });
    const guestViewOfCpu1 = await cpuPosAt(guest.page);
    await new Promise(r => setTimeout(r, 900));
    const guestViewOfCpu2 = await cpuPosAt(guest.page);
    assert.ok(guestViewOfCpu1 && guestViewOfCpu2, 'ゲスト側でCPUカートのotherPlayersエントリが見つからない');
    const cpuMoved = Math.hypot(guestViewOfCpu2.x - guestViewOfCpu1.x, guestViewOfCpu2.z - guestViewOfCpu1.z) > 0.1;
    assert.ok(cpuMoved, `ゲストから見たCPU(${guestViewOfCpu1.id})の位置が変化していない（CPU_STATES中継の疑い）`);
    print(`PASS: ホストのローカルCPUシミュレーションがCPU_STATES経由でゲスト側にも実時間で反映される (${guestViewOfCpu1.id})`);

    // 10. ブラウザ例外が一切発生していないこと
    assert.deepEqual(host.errors, [], 'ホスト側で未捕捉のブラウザ例外が発生: ' + JSON.stringify(host.errors));
    assert.deepEqual(guest.errors, [], 'ゲスト側で未捕捉のブラウザ例外が発生: ' + JSON.stringify(guest.errors));
    print('PASS: ホスト・ゲストともにブラウザ例外0件');

    print('');
    print('ALL MULTIPLAYER DEVICE TESTS PASSED!');
  } finally {
    if (hostBrowser) await hostBrowser.close().catch(() => {});
    if (guestBrowser) await guestBrowser.close().catch(() => {});
    killProcessGroup(serverChild);
    killProcessGroup(workerChild);
  }
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
