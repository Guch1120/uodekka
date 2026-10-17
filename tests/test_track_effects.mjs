import assert from 'node:assert/strict';
import { TrackEffects, TRACK_EFFECTS as C } from '../backend/skills/track_effects.js';
const sample = (t, offset = 0, more = {}) => ({t,offset,lap:1,speed:40,grounded:true,...more});
const advance = (m, seconds) => { for(let i=0;i<Math.round(seconds*10);i++)m.update(0.1); };
{
 const m=new TrackEffects(1000,32);
 assert.equal(m.addTrace(sample(.1,{grounded:false})),null,'不正な横位置を拒否');
 assert.equal(m.addTrace(sample(.1,0,{grounded:false})),null);
 const a=m.addTrace(sample(.1)); assert.ok(a);
 assert.equal(m.addTrace(sample(.12)),null,'近接・連続配置を拒否');
 assert.equal(m.addTrace(sample(.1,8)),null,'別レーンでも同一区間は一個');
 const b=m.addTrace(sample(.2,8),1);assert.equal(b.lifetime,90);
 assert.equal(a.lifetime,60);
 assert.equal(m.addTrace(sample(.3,15)),null,'板全体が路面に収まること');
 for(const t of [.3,.4,.5,.6,.7,.8])m.addTrace(sample(t));
 assert.equal(m.traces.length,C.maxTraces);assert.equal(m.addTrace(sample(.9)),null);
 const oldBorn=a.born;m.addTrace(sample(.1));assert.equal(a.born,oldBorn,'再通過で寿命を延ばさない');
 advance(m,57);const opacity=m.opacity(a);assert.ok(opacity>0&&opacity<.4);
 advance(m,4);assert.ok(!m.traces.includes(a));assert.ok(m.traces.includes(b));
}
{
 const m=new TrackEffects(1000,32);m.addTrace(sample(.1));
 assert.deepEqual(m.stepRacer('p',sample(.09)),[]);
 assert.deepEqual(m.stepRacer('p',sample(.1)),[],'板の上で加速しない');
 assert.equal(m.stepRacer('p',sample(.108))[0].type,'trace-boost');
 m.stepRacer('p',sample(.09));assert.deepEqual(m.stepRacer('p',sample(.108)),[],'同一周の往復で稼がない');
 m.stepRacer('other',sample(.09));assert.equal(m.stepRacer('other',sample(.108))[0].type,'trace-boost');
 assert.equal(m.traces.length,1,'利用で消費しない');
 advance(m,2);m.stepRacer('p',sample(.09,0,{lap:2}));assert.equal(m.stepRacer('p',sample(.108,0,{lap:2}))[0].type,'trace-boost');
 m.stepRacer('air',sample(.09));assert.deepEqual(m.stepRacer('air',sample(.108,0,{grounded:false})),[]);
 m.stepRacer('warp',sample(.01));assert.deepEqual(m.stepRacer('warp',sample(.108)),[]);
 m.stepRacer('reverse',sample(.108));assert.deepEqual(m.stepRacer('reverse',sample(.09)),[]);
 const fast=new TrackEffects(1000,32);fast.addTrace(sample(.1));fast.stepRacer('p',sample(.09));assert.equal(fast.stepRacer('p',sample(.11))[0].type,'trace-boost','一フレームで板を通過しても検出');
}
{
 const m=new TrackEffects(1000,32,[{id:0,t:.2,offset:8}]);const state={isUnlocked:true,cooldown:10};
 m.stepRacer('p',sample(.19,8),state);assert.equal(m.stepRacer('p',sample(.203,8),state)[0].recovered,4);assert.equal(state.cooldown,6);
 m.stepRacer('p',sample(.19,8),state);assert.deepEqual(m.stepRacer('p',sample(.203,8),state),[]);
 m.stepRacer('p',sample(.19,8,{lap:2}),state);state.cooldown=2;assert.equal(m.stepRacer('p',sample(.203,8,{lap:2}),state)[0].recovered,2);assert.equal(state.cooldown,0);
 const locked={isUnlocked:false,cooldown:10};m.stepRacer('locked',sample(.19,8),locked);assert.deepEqual(m.stepRacer('locked',sample(.203,8),locked),[]);assert.equal(locked.cooldown,10);
 m.stepRacer('miss',sample(.19,-8),state);assert.deepEqual(m.stepRacer('miss',sample(.203,-8),state),[]);
}
{
 const host=new TrackEffects(1000,32), guest=new TrackEffects(1000,32);host.addTrace(sample(.1));advance(host,3);
 assert.equal(guest.applySnapshot(host.snapshot()),true);assert.deepEqual(guest.traces,host.traces);
 const old=structuredClone(guest.snapshot());
 for(const mutate of [s=>s.traces.push({...s.traces[0]}),s=>s.traces[0].lifetime=Infinity,s=>s.traces[0].t=-1,s=>s.elapsed=2,s=>s.version=9]){
  const data=host.snapshot();mutate(data);assert.equal(guest.applySnapshot(data),false);assert.deepEqual(guest.snapshot(),old,'不正なsnapshotは状態を部分更新しない');
 }
 host.enabled=false;assert.ok(guest.applySnapshot(host.snapshot()));assert.equal(guest.enabled,false);
}
{
 const m=new TrackEffects(1000,32);m.addTrace(sample(.995));assert.equal(m.addTrace(sample(.005)),null,'周回境界でも隣接配置しない');
 m.stepRacer('p',sample(.985));m.stepRacer('p',sample(.995));advance(m,61);assert.deepEqual(m.stepRacer('p',sample(.005)),[],'滞在中の寿命切れを退出加速にしない');
 const disabled=new TrackEffects(1000,32,[{id:0,t:.2,offset:0}]);disabled.enabled=false;const skill={isUnlocked:true,cooldown:10};
 disabled.stepRacer('p',sample(.19),skill);assert.deepEqual(disabled.stepRacer('p',sample(.205),skill),[]);assert.equal(skill.cooldown,10);
}
console.log('PASS: 痕跡の間隔/上限/非消費/外側寿命/フェード、退出時加速、回復ゲート、周回・復帰制約、同期入力検証');
