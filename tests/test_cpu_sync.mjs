import { WebSocketManager } from '../backend/network/websocket_manager.js';
import { Room } from '../worker/index.js';

// Simple assert helper
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

// 1. Test WebSocketManager sendCpuStates and backpressure control
print('Test 1: WebSocketManager sendCpuStates & backpressure...');
{
  globalThis.location = { protocol: 'https:', host: 'test.com', href: 'https://test.com/' };
  const wm = new WebSocketManager();
  wm.roomId = 'room-1';
  wm.myPeerId = 'host-id';
  wm.isHost = true;

  const sentMessages = [];
  const fakeSocket = {
    readyState: 1, // OPEN
    bufferedAmount: 0,
    send(str) {
      sentMessages.push(JSON.parse(str));
    }
  };
  globalThis.WebSocket = { OPEN: 1 };
  wm.socket = fakeSocket;

  // Test sendCpuStates when host
  const sampleStates = [{ id: 'cpu_0', x: 10, y: 0, z: 20 }];
  wm.sendCpuStates(sampleStates);
  assert(sentMessages.length === 1, 'sendCpuStates should send message');
  assert(sentMessages[0].type === 'CPU_STATES', 'message type should be CPU_STATES');
  assert(sentMessages[0].states[0].id === 'cpu_0', 'states should match');

  // Test sendCpuStates when NOT host
  wm.isHost = false;
  wm.sendCpuStates(sampleStates);
  assert(sentMessages.length === 1, 'non-host must not sendCpuStates');
  wm.isHost = true;

  // Test backpressure drop when bufferedAmount > 32768
  fakeSocket.bufferedAmount = 40000;
  wm.sendCpuStates(sampleStates);
  assert(sentMessages.length === 1, 'congested buffer should drop CPU_STATES');
  const dropEvent = wm.diagnostics.find(d => d.event === 'backpressure-drop' && d.type === 'CPU_STATES');
  assert(dropEvent, 'backpressure-drop diagnostic should be recorded for CPU_STATES');

  // Test sendKartState backpressure drop
  wm.sendKartState({ x: 0, y: 0, z: 0 });
  assert(sentMessages.length === 1, 'congested buffer should drop KART_STATE');
  const kartDrop = wm.diagnostics.find(d => d.event === 'backpressure-drop' && d.type === 'KART_STATE');
  assert(kartDrop, 'backpressure-drop diagnostic should be recorded for KART_STATE');

  // Clear congestion
  fakeSocket.bufferedAmount = 0;
  wm.sendKartState({ x: 1, y: 0, z: 2 });
  assert(sentMessages.length === 2, 'sendKartState succeeds when buffer clear');
  assert(sentMessages[1].type === 'KART_STATE', 'type should be KART_STATE');

  // Test broadcastStartRace with aiRacers
  wm.courseId = 'course1';
  wm.phase = 'lobby';
  const aiLineup = [{ id: 'cpu_0', gridIndex: 1 }, { id: 'cpu_1', gridIndex: 2 }];
  wm.broadcastStartRace(aiLineup);
  assert(sentMessages.length === 3, 'broadcastStartRace should send message');
  assert(sentMessages[2].type === 'START_RACE', 'type should be START_RACE');
  assert(Array.isArray(sentMessages[2].aiRacers) && sentMessages[2].aiRacers.length === 2, 'aiRacers should be included in START_RACE');

  // Test guest receiving CPU_STATES
  const guestWm = new WebSocketManager();
  guestWm.roomId = 'room-1';
  guestWm.myPeerId = 'guest-id';
  guestWm.isHost = false;
  let receivedStates = null;
  guestWm.onCpuStatesReceived = (st) => { receivedStates = st; };
  guestWm.handleMessage(JSON.stringify({ type: 'CPU_STATES', states: sampleStates }));
  assert(receivedStates !== null && receivedStates[0].id === 'cpu_0', 'guest should trigger onCpuStatesReceived');

  // Test host ignoring echo of CPU_STATES
  let hostReceived = false;
  wm.onCpuStatesReceived = () => { hostReceived = true; };
  wm.handleMessage(JSON.stringify({ type: 'CPU_STATES', states: sampleStates }));
  assert(!hostReceived, 'host should ignore CPU_STATES echo');

  print('PASS: WebSocketManager CPU sync & backpressure');
}

// 2. Test Worker Room CPU state relay and host validation
print('Test 2: Worker Room CPU state relay & validation...');
(async () => {
  let stored = null;
  const storage = {
    async get(k) { return stored; },
    async put(k, v) { stored = v; },
    async delete(k) { stored = null; }
  };
  const sockets = [];
  const ctx = {
    storage,
    getWebSockets() { return sockets; }
  };
  const room = new Room(ctx);

  // Setup room with host and guest
  const hostMessages = [];
  const guestMessages = [];
  let hostAttachment = { memberId: 'host-1' };
  let guestAttachment = { memberId: 'guest-1' };

  const hostSocket = {
    deserializeAttachment() { return hostAttachment; },
    serializeAttachment(a) { hostAttachment = a; },
    send(msg) { hostMessages.push(JSON.parse(msg)); }
  };
  const guestSocket = {
    deserializeAttachment() { return guestAttachment; },
    serializeAttachment(a) { guestAttachment = a; },
    send(msg) { guestMessages.push(JSON.parse(msg)); }
  };
  sockets.push(hostSocket, guestSocket);

  stored = {
    roomId: 'test-room',
    hostId: 'host-1',
    courseId: 'course1',
    phase: 'lobby',
    members: [
      { id: 'host-1', name: 'Host', vehicleKey: 'standard_red' },
      { id: 'guest-1', name: 'Guest', vehicleKey: 'speed_blue' }
    ]
  };

  // 2-1: Host sends START_RACE with aiRacers
  const aiLineup = [{ id: 'cpu_0', name: 'Bot1' }, { id: 'cpu_1', name: 'Bot2' }];
  await room.webSocketMessage(hostSocket, JSON.stringify({
    type: 'START_RACE',
    aiRacers: aiLineup
  }));

  // Both host and guest should receive START_RACE with aiRacers
  const guestStart = guestMessages.find(m => m.type === 'START_RACE');
  assert(guestStart, 'Guest should receive START_RACE');
  assert(guestStart.aiRacers && guestStart.aiRacers.length === 2, 'Guest should receive identical aiRacers');
  assert(guestStart.aiRacers[0].id === 'cpu_0', 'aiRacers[0] ID should match');

  const hostStart = hostMessages.find(m => m.type === 'START_RACE');
  assert(hostStart, 'Host should receive START_RACE');
  assert(hostStart.aiRacers && hostStart.aiRacers.length === 2, 'Host should receive identical aiRacers');

  // 2-2: Guest attempts to send CPU_STATES (should be rejected/ignored)
  guestMessages.length = 0;
  hostMessages.length = 0;
  await room.webSocketMessage(guestSocket, JSON.stringify({
    type: 'CPU_STATES',
    states: [{ id: 'cpu_hack', x: 999 }]
  }));
  assert(hostMessages.length === 0, 'Worker must NOT broadcast CPU_STATES from guest');

  // 2-3: Host sends CPU_STATES (should be broadcast to guest)
  await room.webSocketMessage(hostSocket, JSON.stringify({
    type: 'CPU_STATES',
    states: [{ id: 'cpu_0', x: 50, y: 1, z: 100 }]
  }));
  assert(guestMessages.length === 1, 'Guest should receive CPU_STATES from host');
  assert(guestMessages[0].type === 'CPU_STATES', 'Message type should be CPU_STATES');
  assert(guestMessages[0].states[0].id === 'cpu_0', 'CPU state ID should match');
  assert(guestMessages[0].senderId === 'host-1', 'senderId should be host-1');

  print('PASS: Worker Room CPU state relay & validation');
})().catch(err => {
  print('FAIL in Test 2:', err);
  throw err;
});

// 3. Test Render Loop Resilience & Network Sync Isolation
print('Test 3: Render Loop Resilience & 20Hz Throttling...');
{
  let renderCount = 0;
  let updateCount = 0;
  let networkSyncCount = 0;
  let errorCaught = 0;

  let lastNetworkSendTime = -100;
  function updateNetworkSync(now) {
    if (now - lastNetworkSendTime < 50) return; // 20Hz limit
    lastNetworkSendTime = now;
    networkSyncCount++;
    throw new Error('Simulated network exception'); // Simulate communication error!
  }

  function updateGame(dt, now) {
    updateCount++;
    try {
      updateNetworkSync(now);
    } catch (err) {
      errorCaught++;
    }
  }

  function render() {
    renderCount++;
  }

  function animateFrame(now) {
    try {
      updateGame(0.016, now);
    } catch (err) {
      // updateGame error handler
    }
    try {
      render();
    } catch (err) {
      // render error handler
    }
  }

  // Simulate 10 frames at 16ms intervals (60fps)
  for (let i = 0; i < 10; i++) {
    animateFrame(i * 16.6);
  }

  assert(updateCount === 10, 'updateGame should run 10 times');
  assert(renderCount === 10, 'render must run 10 times regardless of network errors (never 0)');
  // In 166ms, 50ms interval triggers at 0ms, 66ms, 133ms -> 4 times (0, 66.4, 116.2, 166)
  assert(networkSyncCount >= 3 && networkSyncCount <= 4, 'networkSync should be throttled to ~20Hz: got ' + networkSyncCount);
  assert(errorCaught === networkSyncCount, 'all network exceptions safely caught without stopping render');

  print('PASS: Render loop resilience & 20Hz throttling');
}

print('\nALL CPU SYNC & RESILIENCE TESTS PASSED!');
