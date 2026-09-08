import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { P2PManager } from '../backend/network/p2p_manager.js';

// Deterministic PeerJS transport; checks protocol authority and membership without a signaling service.
const registry = new Map();
let sequence = 0;
class Connection extends EventEmitter {
  constructor(peer, metadata) { super(); this.peer = peer; this.metadata = metadata; this.open = false; }
  send(data) { const payload = structuredClone(data); queueMicrotask(() => { if (this.other.open) this.other.emit('data', payload); }); }
  close() { if (!this.open) return; this.open = false; this.emit('close'); if (this.other.open) { this.other.open = false; this.other.emit('close'); } }
}
class Peer extends EventEmitter {
  constructor(id = `guest-${++sequence}`) {
    super(); this.id = id; this.links = [];
    queueMicrotask(() => {
      if (registry.has(id)) { this.emit('error', {type:'unavailable-id'}); return; }
      if (this.destroyed) return;
      registry.set(id, this); this.emit('open', id);
    });
  }
  connect(id, options) {
    const local = new Connection(id, options.metadata);
    this.links.push(local);
    queueMicrotask(() => {
      const target = registry.get(id);
      if (!target) { this.emit('error', {type:'peer-unavailable'}); return; }
      const remote = new Connection(this.id, options.metadata);
      target.links.push(remote); local.other = remote; remote.other = local;
      target.emit('connection', remote);
      local.open = true; remote.open = true;
      local.emit('open'); remote.emit('open');
    });
    return local;
  }
  destroy() {
    this.destroyed = true;
    if (registry.get(this.id) === this) registry.delete(this.id);
    this.links.forEach(c => c.close());
  }
}
globalThis.window = { Peer };
const tick = () => new Promise(resolve => setImmediate(resolve));
const host = new P2PManager(), guest = new P2PManager(), guest2 = new P2PManager();
try {
  assert.throws(() => P2PManager.normalizeRoomId('a!'), /ルームID/);
  assert.equal(P2PManager.normalizeRoomId(' RACE-123 '), 'race-123');
  await host.createRoom({roomId:'race-123',name:'ホスト花子',vehicleKey:'standard_red'});
  await guest.joinRoom('RACE-123',{name:'ゲスト太郎',vehicleKey:'speed_blue'});
  await guest2.joinRoom('race-123',{name:'ゲスト次郎',vehicleKey:'handling_green'});
  await tick();
  assert.deepEqual(host.members.map(m=>m.name),['ホスト花子','ゲスト太郎','ゲスト次郎']);
  assert.deepEqual(guest.members,host.members);
  assert.deepEqual(guest2.members,host.members);
  assert.equal(guest.members[0].isHost,true);
  assert.equal(guest.members[1].vehicleKey,'speed_blue');
  console.log('PASS: custom room ID, named host first, complete membership shared with both guests');

  assert.equal(host.broadcastStartRace(),false);
  assert.equal(host.selectCourse('course2'),true);
  await tick();
  assert.equal(guest.courseId,'course2'); assert.equal(guest2.courseId,'course2');
  assert.equal(guest.selectCourse('course3'),false);
  assert.equal(guest.broadcastStartRace(),false);
  host.handleDataFromGuest(guest.myPeerId,{type:'START_RACE',courseId:'course3'});
  host.handleDataFromGuest(guest.myPeerId,{type:'ROOM_STATE',courseId:'course3',members:[]});
  assert.equal(host.phase,'lobby'); assert.equal(host.courseId,'course2');
  console.log('PASS: course sync, no start before course selection, guests cannot change course or start via forged packets');

  const duplicate = new P2PManager();
  await assert.rejects(duplicate.createRoom({roomId:'race-123'}),/使用中/);
  duplicate.leaveRoom();
  assert(registry.has('uodekka-race-123'));
  const missing = new P2PManager();
  await assert.rejects(missing.joinRoom('missing-room'),/見つかりません/);
  assert.equal(missing.peer,null);
  console.log('PASS: duplicate IDs and missing rooms fail cleanly');

  guest2.leaveRoom(); await tick();
  assert.equal(host.members.length,2); assert.equal(guest.members.length,2);
  const starts=[];
  host.onGameStart = data => starts.push(['host',data]);
  guest.onGameStart = data => starts.push(['guest',data]);
  assert.equal(host.broadcastStartRace(),true);
  assert.equal(host.broadcastStartRace(),false);
  await tick();
  assert.equal(starts.length,2);
  assert.deepEqual(starts.map(s=>s[1].courseId),['course2','course2']);
  assert.equal(starts[1][1].delayMs,2200);
  assert.equal(host.selectCourse('course3'),false);
  console.log('PASS: leaving updates roster, start delivered exactly once, matching course and countdown delay');

  const late = new P2PManager();
  await assert.rejects(late.joinRoom('race-123'),/開始しています/);
  late.leaveRoom();
  let disconnected=false;
  guest.onDisconnected=()=>{disconnected=true;};
  host.leaveRoom(); await tick();
  assert(disconnected); assert.equal(guest.roomId,null);
  await host.createRoom({roomId:'race-123',name:'再作成'});
  assert.equal(host.members.length,1);
  assert.equal(host.courseId,null);
  console.log('PASS: late join rejected, host departure reported, room can be recreated without stale state');
} finally { host.leaveRoom(); guest.leaveRoom(); guest2.leaveRoom(); }
