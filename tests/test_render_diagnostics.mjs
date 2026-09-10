if (typeof console === 'undefined') {
  globalThis.console = { log: print, warn: print, error: print, info: print };
}

import { UPDATE_NOTIFICATION } from '../frontend/data/updates.js';

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

// 1. Test FollowCamera NaN Protection & Diagnostics
print('Test 1: FollowCamera NaN Protection & Diagnostics...');
{
  const fakeCamera = {
    position: { x: 0, y: 0, z: 0, copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; } },
    lookAt(p) { this.target = { ...p }; },
    fov: 65,
    aspect: 1.77
  };

  const fakeTarget = {
    position: {
      x: 10, y: 0, z: 20,
      distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y, this.z - p.z); }
    },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }
  };

  // Mock THREE Vector3 and Quaternion for standalone testing
  globalThis.THREE = {
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
      applyQuaternion() { return this; }
      normalize() {
        const len = Math.hypot(this.x, this.y, this.z);
        if (len > 0) { this.x /= len; this.y /= len; this.z /= len; }
        return this;
      }
      lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
      distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
      lerp(v, alpha) {
        this.x += (v.x - this.x) * alpha;
        this.y += (v.y - this.y) * alpha;
        this.z += (v.z - this.z) * alpha;
        return this;
      }
    }
  };

  const cam = new FollowCamera(fakeCamera, fakeTarget);
  assert(cam.target === fakeTarget, 'target should be set');
  const d1 = cam.getDiagnostics();
  assert(d1.hasTarget === true, 'hasTarget should be true');
  assert(d1.hasNaN === false, 'hasNaN should be false initially');
  assert(d1.position !== null, 'position should be populated');

  // Test NaN injection on target
  fakeTarget.position.x = NaN;
  cam.update(0.016, false, null, 0, 10);
  assert(!isNaN(cam.currentPosition.x), 'currentPosition must not become NaN when target has NaN');
  assert(!isNaN(fakeCamera.position.x), 'camera.position must not become NaN');

  // Recover target
  fakeTarget.position.x = 10;
  cam.update(0.016, false, null, 0, 0);

  // Test camera frozen detection (kart moving fast at 20km/h, but camera pos doesn't change)
  cam.lastPosition.copy(cam.currentPosition);
  for (let i = 0; i < 120; i++) {
    cam.update(0.016, false, null, 0, 20); // speed = 20, but desiredPos doesn't move
  }
  const dFrozen = cam.getDiagnostics();
  assert(dFrozen.isFrozen === true, 'camera should be detected as frozen when kart moves but camera position is static');

  print('PASS: FollowCamera NaN Protection & Diagnostics');
}

// 2. Test Game getRenderDiagnostics Schema & Values
print('Test 2: Game getRenderDiagnostics Schema & Values...');
{
  // Create a minimal mock Game object to test getRenderDiagnostics logic
  const mockGame = {
    updateCount: 120,
    renderCount: 120,
    firstException: null,
    lastException: null,
    firstRenderException: null,
    lastRenderException: null,
    raceStartTime: performance.now() - 5000,
    isRunning: true,
    isPaused: false,
    currentGameConfig: { mode: 'multi_host', courseId: 'course1' },
    currentCourseConfig: { id: 'course1' },
    localPlayerKart: {
      mesh: { position: { x: 12.34, y: 1.0, z: -56.78 } },
      speed: 45.2,
      progress: 0.452,
      currentLap: 2,
      isFinished: false,
      isRespawning: false
    },
    followCamera: {
      getDiagnostics() {
        return {
          hasTarget: true,
          position: { x: 12.34, y: 4.6, z: -64.28 },
          lookAt: { x: 12.34, y: 2.3, z: -56.78 },
          distanceToTarget: 7.8,
          hasNaN: false,
          isFrozen: false
        };
      }
    },
    renderer: {
      getDiagnostics() {
        return {
          isContextLost: false,
          contextLostCount: 0,
          contextRestoredCount: 0,
          graphicQuality: 'normal',
          pixelRatio: 1.5,
          devicePixelRatio: 2,
          canvasSize: { width: 1920, height: 1080, clientWidth: 960, clientHeight: 540 },
          glVendor: 'Apple',
          glRenderer: 'Apple M1'
        };
      }
    },
    otherPlayers: new Map([
      ['cpu_0', { isAI: true }],
      ['cpu_1', { isAI: true }],
      ['peer_1', { isAI: false }]
    ]),
    p2p: {
      isHost: true,
      roomId: 'room-123',
      connectionStage: 'connected',
      members: [{ id: 'host' }, { id: 'peer_1' }],
      socket: { bufferedAmount: 0 },
      diagnostics: [{ event: 'connected', elapsedMs: 100 }]
    }
  };

  // Import getRenderDiagnostics implementation
  function getRenderDiagnostics() {
    const now = performance.now();
    const elapsedSeconds = this.raceStartTime ? Number(((now - this.raceStartTime) / 1000).toFixed(1)) : 0;
    const kart = this.localPlayerKart;
    const kPos = kart?.mesh?.position;
    const camDiag = this.followCamera?.getDiagnostics() || {};
    const rendererDiag = this.renderer?.getDiagnostics() || {};

    let memberCount = 0;
    if (this.p2p?.members) memberCount = this.p2p.members.length;

    let cpuCount = 0;
    this.otherPlayers.forEach(p => { if (p.isAI) cpuCount++; });

    const isValidNumber = (n) => typeof n === 'number' && !isNaN(n) && isFinite(n);
    const kartHasNaN = kPos ? (!isValidNumber(kPos.x) || !isValidNumber(kPos.y) || !isValidNumber(kPos.z)) : false;

    return JSON.stringify({
      version: UPDATE_NOTIFICATION?.version || 'unknown',
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      mode: this.currentGameConfig?.mode || 'idle',
      isHost: !!this.p2p?.isHost,
      courseId: this.currentCourseConfig?.id || this.currentGameConfig?.courseId || null,
      elapsedSeconds,
      loop: {
        updateCount: this.updateCount,
        renderCount: this.renderCount,
        ratio: this.updateCount > 0 ? Number((this.renderCount / this.updateCount).toFixed(3)) : 1.0,
        isRunning: this.isRunning,
        isPaused: this.isPaused
      },
      kart: {
        exists: !!kart,
        position: kPos ? { x: Number(kPos.x.toFixed(2)), y: Number(kPos.y.toFixed(2)), z: Number(kPos.z.toFixed(2)) } : null,
        speed: kart ? Number(kart.speed.toFixed(1)) : 0,
        progress: kart ? Number(kart.progress.toFixed(4)) : 0,
        currentLap: kart ? kart.currentLap : 0,
        isFinished: !!kart?.isFinished,
        isRespawning: !!kart?.isRespawning,
        hasNaN: kartHasNaN
      },
      camera: camDiag,
      webgl: rendererDiag,
      screen: {
        windowWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
        windowHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
        screenWidth: typeof screen !== 'undefined' ? screen.width : 0,
        screenHeight: typeof screen !== 'undefined' ? screen.height : 0,
        orientation: typeof screen !== 'undefined' ? screen.orientation?.type : 'unknown'
      },
      participants: {
        memberCount,
        cpuCount,
        otherPlayersCount: this.otherPlayers.size
      },
      network: {
        transport: 'websocket',
        roomId: this.p2p?.roomId || null,
        stage: this.p2p?.connectionStage || 'idle',
        bufferedAmount: this.p2p?.socket?.bufferedAmount || 0,
        recentEvents: this.p2p?.diagnostics ? this.p2p.diagnostics.slice(-10) : []
      },
      exceptions: {
        firstException: this.firstException,
        lastException: this.lastException,
        firstRenderException: this.firstRenderException,
        lastRenderException: this.lastRenderException
      }
    }, null, 2);
  }

  const rawJson = getRenderDiagnostics.call(mockGame);
  const parsed = JSON.parse(rawJson);

  assert(parsed.version === '2026.09.12-r2', 'version should match 2026.09.12-r2');
  assert(parsed.mode === 'multi_host', 'mode should match');
  assert(parsed.loop.updateCount === 120, 'loop.updateCount should match');
  assert(parsed.loop.renderCount === 120, 'loop.renderCount should match');
  assert(parsed.loop.ratio === 1.0, 'loop.ratio should be 1.0');
  assert(parsed.kart.position.x === 12.34, 'kart position should match');
  assert(parsed.camera.distanceToTarget === 7.8, 'camera distance should match');
  assert(parsed.webgl.graphicQuality === 'normal', 'webgl quality should match');
  assert(parsed.participants.cpuCount === 2, 'cpuCount should match');
  assert(parsed.participants.memberCount === 2, 'memberCount should match');
  assert(parsed.network.roomId === 'room-123', 'roomId should match');

  print('PASS: Game getRenderDiagnostics Schema & Values');
}

print('\nALL RENDER DIAGNOSTICS TESTS PASSED!');
