import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { P2PManager } from '../backend/network/p2p_manager.js';
import { validateIceServers, loadIceConfig } from '../backend/network/ice_config.js';

const registry = new Map(), peers = [], policies = [];
let sequence = 0, stalls = 0, dropStates = 0, suppressOpen = false, failIce = false;
class Connection extends EventEmitter {
  constructor(peer, metadata) { super(); this.peer = peer; this.metadata = metadata; this.open = false; this.peerConnection = new EventTarget(); }
  send(data) {
    if (data.type === 'ROOM_STATE' && dropStates > 0) { dropStates--; return; }
    queueMicrotask(() => { if(this.other?.open) this.other.emit('data', structuredClone(data)); });
  }
  close() { if (!this.open) return; this.open = false; this.emit('close'); if(this.other?.open) { this.other.open = false; this.other.emit('close'); } }
}
class Peer extends EventEmitter {
  constructor(id = `guest-${++sequence}`, options) {
    super(); this.id=id; this.options=options; this.links=[]; peers.push(this);
    if (suppressOpen) return;
    queueMicrotask(() => { if(this.destroyed) return; registry.set(id,this); this.emit('open',id); });
  }
  connect(id, options) {
    policies.push(this.options.config.iceTransportPolicy);
    const local = new Connection(id, options.metadata); this.links.push(local);
    if(stalls-- > 0) {
      if (failIce) queueMicrotask(()=>{local.peerConnection.iceConnectionState='failed';local.peerConnection.dispatchEvent(new Event('iceconnectionstatechange'));});
      return local;
    }
    queueMicrotask(()=>{
      const host=registry.get(id);
      if(!host) { this.emit('error',{type:'peer-unavailable'}); return; }
      const remote=new Connection(this.id,options.metadata);host.links.push(remote);
      local.other=remote;remote.other=local;host.emit('connection',remote);
      local.open=true;remote.open=true;local.emit('open');remote.emit('open');
    });
    return local;
  }
  reconnect() { queueMicrotask(()=>this.emit('open',this.id)); }
  destroy() { this.destroyed=true; if(registry.get(this.id)===this)registry.delete(this.id);this.links.forEach(c=>c.close()); }
}
globalThis.window={Peer};
const config={iceServers:[{urls:['turn:relay.example.test:3478','turns:relay.example.test:443?transport=tcp'],username:'test-user',credential:'test-secret'}],relayConfigured:true};
const options={configProvider:async()=>config,timeouts:{signaling:35,connecting:35,progress:15,maximum:100,handshake:70,retry:5,request:5}};
const tick=()=>new Promise(r=>setImmediate(r));
const host=new P2PManager(options),guest=new P2PManager(options);
try {
 await host.createRoom({roomId:'test-room',name:'Host'});
 stalls=1;
 await guest.joinRoom('test-room',{name:'Guest'});
 assert.deepEqual(policies,['all','relay']);
 assert.equal(host.members.length,2);
 assert.equal(guest.members.length,2);
 assert(peers[1].destroyed);
 assert(!guest.getDiagnostics().includes('test-secret'));
 assert(!guest.getDiagnostics().includes('relay.example'));
 console.log('PASS: retry uses a new relay-only peer, destroys stale transport, and redacts diagnostics');

 guest.leaveRoom();policies.length=0;stalls=1;failIce=true;
 guest.timeouts.connecting=10000;
 await guest.joinRoom('test-room');
 assert.deepEqual(policies,['all','relay']);
 assert(guest.diagnostics.some(e=>e.event==='attempt-failed' && e.code==='ice-failed'));
 guest.timeouts.connecting=35;failIce=false;
 console.log('PASS: terminal ICE failure immediately retries with relay instead of waiting for timeout');

 guest.leaveRoom(); policies.length=0; dropStates=2;
 await guest.joinRoom('test-room');
 assert.equal(guest.members.length,2);
 assert.equal(policies.length,1);
 console.log('PASS: room-state request recovers lost initial room information');

 guest.leaveRoom(); policies.length=0;
 await assert.rejects(guest.joinRoom('missing-room'),/見つかりません/);
 assert.equal(policies.length,1);
 console.log('PASS: missing room is terminal, not retried');

 suppressOpen=true;
 const pending=guest.joinRoom('test-room'); const rejected=assert.rejects(pending,/キャンセル/);
 await tick(); guest.leaveRoom(); await rejected;
 assert.equal(guest.peer,null);
 suppressOpen=false;
 console.log('PASS: cancellation during signaling settles immediately');

 stalls=4;policies.length=0;
 const cancelOnRetry=info=>{if(info.stage==='retrying')guest.leaveRoom();};
 guest.onConnectionStatus=cancelOnRetry;
 const retry=guest.joinRoom('test-room');await assert.rejects(retry,/キャンセル/);
 assert.equal(policies.length,1);guest.onConnectionStatus=null;stalls=0;
 console.log('PASS: cancelling between attempts never opens a new peer');

 host.peer.emit('disconnected');await tick();
 assert.equal(host.roomId,'test-room');
 assert(host.diagnostics.some(e=>e.event==='signaling-restored'));
 console.log('PASS: transient signaling disconnect preserves the room');

 for(const id of ['room-','room--abc']) assert.throws(()=>P2PManager.normalizeRoomId(id));
 assert.equal(P2PManager.normalizeRoomId(' ROOM-123 '),'room-123');

 assert.throws(()=>validateIceServers([{urls:'turn:relay.test:3478'}]));
 const oldFetch=globalThis.fetch;
 try {
   globalThis.fetch=async()=>({ok:true,json:async()=>({iceServers:config.iceServers})});
   assert((await loadIceConfig()).relayConfigured);
   globalThis.fetch=async()=>({ok:false});
   const fallback=await loadIceConfig();assert.equal(fallback.relayConfigured,false);
   assert(!JSON.stringify(fallback).includes('turn.peerjs.com'));
 }finally{globalThis.fetch=oldFetch;}
 console.log('PASS: invalid IDs/credentials rejected, unavailable API falls back explicitly without retired TURN hosts');
} finally {host.leaveRoom();guest.leaveRoom();}
