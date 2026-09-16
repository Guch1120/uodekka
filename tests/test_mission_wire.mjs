import { WebSocketManager } from '../backend/network/websocket_manager.js';
import { Room } from '../worker/index.js';
import { MISSION_SPEC_VERSION } from '../backend/missions/mission_definitions.js';

const print = console.log;
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

function makeFakeSocket(sentMessages) {
  return {
    readyState: 1,
    bufferedAmount: 0,
    send(str) { sentMessages.push(JSON.parse(str)); }
  };
}

// 1. WebSocketManager: broadcastStartRace carries missionAssignments/cpuLevel/specVersion
print('Test 1: WebSocketManager.broadcastStartRace includes mission fields...');
{
  globalThis.location = { protocol: 'https:', host: 'test.com', href: 'https://test.com/' };
  globalThis.WebSocket = { OPEN: 1 };
  const wm = new WebSocketManager();
  wm.roomId = 'room-1';
  wm.myPeerId = 'host-id';
  wm.isHost = true;
  wm.courseId = 'course1';
  wm.phase = 'lobby';

  const sentMessages = [];
  wm.socket = makeFakeSocket(sentMessages);

  const missionAssignments = { 'host-id': 'red_boost_run', 'ai_0': 'blue_top_half_keep' };
  wm.broadcastStartRace([{ id: 'ai_0', gridIndex: 1 }], missionAssignments, 7);

  assert(sentMessages.length === 1, 'broadcastStartRace should send one message');
  const msg = sentMessages[0];
  assert(msg.type === 'START_RACE', 'message type should be START_RACE');
  assert(msg.missionAssignments['host-id'] === 'red_boost_run', 'missionAssignments should be included as-is');
  assert(msg.cpuLevel === 7, 'cpuLevel should be included');
  assert(msg.specVersion === MISSION_SPEC_VERSION, 'specVersion should be included');
  print('PASS: WebSocketManager.broadcastStartRace includes mission fields');
}

// 2. WebSocketManager: client refuses to start when specVersion mismatches
print('Test 2: client-side specVersion mismatch refuses to start...');
{
  const wm = new WebSocketManager();
  wm.roomId = 'room-1';
  wm.myPeerId = 'guest-id';
  wm.isHost = false;

  let gameStarted = false;
  let errorMsg = null;
  wm.onGameStart = () => { gameStarted = true; };
  wm.onConnectionError = (msg) => { errorMsg = msg; };

  wm.handleMessage(JSON.stringify({ type: 'START_RACE', courseId: 'course1', specVersion: MISSION_SPEC_VERSION + 999 }));
  assert(!gameStarted, 'onGameStart must not fire when specVersion mismatches');
  assert(errorMsg, 'onConnectionError should fire with a message when specVersion mismatches');

  // Matching version should proceed normally
  wm.handleMessage(JSON.stringify({ type: 'START_RACE', courseId: 'course1', specVersion: MISSION_SPEC_VERSION, missionAssignments: {}, cpuLevel: 1 }));
  assert(gameStarted, 'onGameStart should fire when specVersion matches');
  print('PASS: client-side specVersion mismatch refuses to start');
}

// 3. Worker Room: START_RACE forwards missionAssignments/cpuLevel/specVersion to all members
print('Test 3: Worker Room forwards mission fields in START_RACE...');
(async () => {
  let stored = null;
  const storage = {
    async get() { return stored; },
    async put(k, v) { stored = v; },
    async delete() { stored = null; }
  };
  const sockets = [];
  const ctx = { storage, getWebSockets() { return sockets; } };
  const room = new Room(ctx);

  const hostMessages = [];
  const guestMessages = [];
  let hostAttachment = { memberId: 'host-1' };
  let guestAttachment = { memberId: 'guest-1' };
  const hostSocket = { deserializeAttachment() { return hostAttachment; }, serializeAttachment(a) { hostAttachment = a; }, send(msg) { hostMessages.push(JSON.parse(msg)); } };
  const guestSocket = { deserializeAttachment() { return guestAttachment; }, serializeAttachment(a) { guestAttachment = a; }, send(msg) { guestMessages.push(JSON.parse(msg)); } };
  sockets.push(hostSocket, guestSocket);

  stored = {
    roomId: 'test-room', hostId: 'host-1', courseId: 'course1', phase: 'lobby',
    members: [
      { id: 'host-1', name: 'Host', vehicleKey: 'standard_red', specVersion: MISSION_SPEC_VERSION },
      { id: 'guest-1', name: 'Guest', vehicleKey: 'speed_blue', specVersion: MISSION_SPEC_VERSION }
    ]
  };

  const missionAssignments = { 'host-1': 'red_boost_run', 'guest-1': 'blue_high_cruise' };
  await room.webSocketMessage(hostSocket, JSON.stringify({ type: 'START_RACE', aiRacers: [], missionAssignments, cpuLevel: 6 }));

  const guestStart = guestMessages.find(m => m.type === 'START_RACE');
  assert(guestStart, 'guest should receive START_RACE');
  assert(guestStart.missionAssignments['host-1'] === 'red_boost_run', 'missionAssignments should be forwarded to guest');
  assert(guestStart.cpuLevel === 6, 'cpuLevel should be forwarded to guest');
  assert(guestStart.specVersion === MISSION_SPEC_VERSION, 'specVersion should be forwarded to guest');
  print('PASS: Worker Room forwards mission fields in START_RACE');

  // 4. Worker Room: malformed missionAssignments/cpuLevel fall back to safe defaults instead of propagating garbage
  print('Test 4: Worker Room sanitizes malformed mission fields...');
  stored.phase = 'lobby';
  guestMessages.length = 0;
  await room.webSocketMessage(hostSocket, JSON.stringify({ type: 'START_RACE', aiRacers: [], missionAssignments: 'not-an-object', cpuLevel: 'not-a-number' }));
  const guestStart2 = guestMessages.find(m => m.type === 'START_RACE');
  assert(guestStart2, 'guest should still receive START_RACE with sanitized fields');
  assert(typeof guestStart2.missionAssignments === 'object' && !Array.isArray(guestStart2.missionAssignments) && Object.keys(guestStart2.missionAssignments).length === 0, 'malformed missionAssignments should fall back to {}');
  assert(guestStart2.cpuLevel === 1, 'malformed cpuLevel should fall back to 1');
  print('PASS: Worker Room sanitizes malformed mission fields');

  // 5. Worker Room: refuses START_RACE when members have mismatched specVersion
  print('Test 5: Worker Room refuses START_RACE on spec-mismatch...');
  stored.phase = 'lobby';
  stored.members[1].specVersion = MISSION_SPEC_VERSION + 1; // guest is on a different version
  hostMessages.length = 0;
  guestMessages.length = 0;
  await room.webSocketMessage(hostSocket, JSON.stringify({ type: 'START_RACE', aiRacers: [] }));
  assert(guestMessages.length === 0, 'guest must not receive START_RACE when specVersion mismatches');
  const errorToHost = hostMessages.find(m => m.type === 'ROOM_ERROR' && m.code === 'spec-mismatch');
  assert(errorToHost, 'host should receive a spec-mismatch ROOM_ERROR instead');
  assert(stored.phase === 'lobby', 'room phase must remain lobby (race must not start) on spec-mismatch');
  print('PASS: Worker Room refuses START_RACE on spec-mismatch');

  print('');
  print('ALL MISSION WIRE TESTS PASSED!');
})().catch(err => {
  print('FAIL:', err);
  process.exit(1);
});
