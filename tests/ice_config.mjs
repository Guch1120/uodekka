import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { loadIceConfig } from '../backend/network/ice_config.js';
const require=createRequire(import.meta.url);
const handler=require('../api/ice-servers.cjs');
const direct=await handler.getConfig({});
assert.equal(direct.relayConfigured,false);
assert.equal(direct.reason,'not-configured');

const env={TURN_URLS:'turn:relay.example.test:3478,turn:relay.example.test:3478?transport=tcp,turns:relay.example.test:443?transport=tcp',TURN_SHARED_SECRET:'unit-test-secret'};
const a=await handler.getConfig(env),b=await handler.getConfig(env);
assert(a.relayConfigured);assert.notEqual(a.iceServers[1].username,b.iceServers[1].username);
assert.equal(a.iceServers[1].credential,createHmac('sha1',env.TURN_SHARED_SECRET).update(a.iceServers[1].username).digest('base64'));
assert(a.expiresAt-Math.floor(Date.now()/1000)<=600);
assert(!JSON.stringify(a).includes(env.TURN_SHARED_SECRET));

let called=false;
const metered=await handler.getConfig({METERED_DOMAIN:'demo.metered.live',METERED_TURN_API_KEY:'unit-api-key'},async(url,options)=>{
 assert.equal(url.hostname,'demo.metered.live');assert.equal(url.pathname,'/api/v1/turn/credentials');
 assert.equal(url.searchParams.get('apiKey'),'unit-api-key');assert.equal(options.redirect,'error');
 called=true;return {ok:true,json:async()=>a.iceServers};
});
assert(called && metered.relayConfigured);
await assert.rejects(handler.getConfig({METERED_DOMAIN:'evil.test',METERED_TURN_API_KEY:'key'}));
await assert.rejects(handler.getConfig({TURN_URLS:'turn:relay.test:3478'}));
await assert.rejects(handler.getConfig({TURN_URLS:'https://evil.test',TURN_SHARED_SECRET:'secret'}));

const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}});
let res=response();await handler({method:'POST',headers:{}},res);
assert.equal(res.statusCode,405);assert.equal(res.headers['Cache-Control'],'private, no-store');
res=response();await handler({method:'GET',headers:{'sec-fetch-site':'cross-site'}},res);
assert.equal(res.statusCode,403);
const oldEnv=process.env.TURN_URLS;const oldSecret=process.env.TURN_SHARED_SECRET;
try{
 process.env.TURN_URLS='invalid';delete process.env.TURN_SHARED_SECRET;
 res=response();await handler({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,503);assert.deepEqual(res.body,{error:'relay-unavailable'});
}finally{
 if(oldEnv===undefined)delete process.env.TURN_URLS;else process.env.TURN_URLS=oldEnv;
 if(oldSecret===undefined)delete process.env.TURN_SHARED_SECRET;else process.env.TURN_SHARED_SECRET=oldSecret;
}
const savedFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>({ok:true,json:async()=>({iceServers:[{urls:'turn:example.test:3478'}]})});
 assert.equal((await loadIceConfig()).relayConfigured,false);
 const controller=new AbortController();controller.abort();
 await assert.rejects(loadIceConfig({signal:controller.signal}),/キャンセル/);
}finally{globalThis.fetch=savedFetch;}
console.log('PASS: direct fallback, temporary coturn credentials, Metered validation, no-store, provider errors, cancellation and invalid credentials');
