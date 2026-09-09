import assert from 'node:assert/strict';
import { probeRelay } from '../backend/network/relay_probe.js';
let mode='relay', last;
class PC {
 constructor(config){last=this;assert.equal(config.iceTransportPolicy,'relay');}
 createDataChannel(){}
 async createOffer(){return {};}
 async setLocalDescription(){queueMicrotask(()=>{
  if(mode==='relay')this.onicecandidate?.({candidate:{type:'relay'}});
  if(mode==='legacy')this.onicecandidate?.({candidate:{candidate:'candidate:1 1 udp 1 127.0.0.1 9 typ relay'}});
  if(mode==='direct')this.onicecandidate?.({candidate:{type:'host'}});
  if(mode!=='stall'){this.iceGatheringState='complete';this.onicegatheringstatechange?.();}
 });}
 close(){this.closed=true;}
}
for(const [kind,status] of [['relay','reachable'],['legacy','reachable'],['direct','unreachable'],['stall','unreachable']]){
 mode=kind;assert.equal((await probeRelay([],{PeerConnection:PC,timeoutMs:20})).status,status);assert(last.closed);
}
const controller=new AbortController();mode='stall';const pending=probeRelay([],{PeerConnection:PC,signal:controller.signal});controller.abort();assert.equal((await pending).status,'cancelled');assert(last.closed);
assert.equal((await probeRelay([],{PeerConnection:null})).status,'unsupported');
console.log('PASS: relay allocation, legacy WebKit candidate, no false success for direct candidate, timeout, cancellation, unsupported, transport cleanup');
