import { createSkillState, activateSkill, tickSkill } from '../backend/skills/unique_skills.js';

const print = console.log;
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

function makeFakeKart(overrides = {}) {
  return {
    speed: 10,
    maxSpeed: 40,
    boostTimer: 0,
    boostMultiplier: 1,
    isAirborne: false,
    isGliding: false,
    hasShield: false,
    isGigaStampede: false,
    invincibleTimer: 0,
    missionSkillCooldownMult: 1,
    mesh: { userData: {}, scale: { set: () => {} } },
    _boostCalls: [],
    applyBoost(mult, dur) {
      this._boostCalls.push({ mult, dur });
      this.boostMultiplier = Math.max(this.boostMultiplier, mult);
      this.boostTimer = Math.max(this.boostTimer, dur);
    },
    ...overrides
  };
}

const ROCKET_SKILL = { id: 'rocket_charge', cooldown: 14.0, duration: 3.0 };

// 1. スキル未解禁/救済なしの通常クールダウン計算
print('Test 1: activateSkill computes cooldown from missionSkillCooldownMult...');
{
  const kart = makeFakeKart({ missionSkillCooldownMult: 0.7 });
  const state = createSkillState('standard_red', true);
  activateSkill(kart, state, ROCKET_SKILL, null);
  assert(Math.abs(state.cooldown - 14.0 * 0.7) < 1e-9, 'cooldown should be scaled by missionSkillCooldownMult (rescue-driven)');
  assert(state.activeTimer === 3.0, 'activeTimer should equal skill duration');
  assert(state.activeType === 'rocket_charge', 'activeType should be set to the skill id');
  print('PASS: activateSkill computes cooldown from missionSkillCooldownMult');
}

// 2. ミッション未達成（stage 0）では追加効果を予約しない
print('Test 2: no pending augment when mission stage is below 2...');
{
  const kart = makeFakeKart();
  const state = createSkillState('standard_red', true);
  const tracker = { appliedReward: { skillStageUnlocked: 0 } };
  activateSkill(kart, state, ROCKET_SKILL, tracker);
  assert(kart._pendingRocketAugment === null, 'no augment should be pending below stage 2');
  print('PASS: no pending augment when mission stage is below 2');
}

// 3. 2段階達成: 発動終了後に倍率1.15・1秒の追加ブーストが1回だけ適用される
print('Test 3: stage-2 augment applies once, after the base skill duration ends...');
{
  const kart = makeFakeKart();
  const state = createSkillState('standard_red', true);
  const tracker = { appliedReward: { skillStageUnlocked: 2 } };
  activateSkill(kart, state, ROCKET_SKILL, tracker);
  assert(kart._pendingRocketAugment && Math.abs(kart._pendingRocketAugment.multiplier - 1.15) < 1e-9, 'stage2 augment multiplier should be 1.15');
  assert(kart._pendingRocketAugment.duration === 1.0, 'stage2 augment duration should be 1.0s');

  // 基本持続時間(3.0s)が尽きるまではブースト未発動
  tickSkill(kart, state, 2.9);
  assert(kart._boostCalls.length === 0, 'augment must not apply before the base skill duration ends');

  // 残り0.1sで発動終了 => この瞬間に一度だけ追加ブーストが適用される
  tickSkill(kart, state, 0.2);
  assert(kart._boostCalls.length === 1, 'augment should apply exactly once when the base duration ends');
  assert(Math.abs(kart._boostCalls[0].mult - 1.15) < 1e-9, 'applied boost multiplier should match the stage2 augment');
  assert(kart._boostCalls[0].dur === 1.0, 'applied boost duration should match the stage2 augment');
  assert(kart._pendingRocketAugment === null, 'pending augment must be cleared after being consumed');
  assert(state.activeType === null, 'activeType should be cleared once the skill (and augment) finishes');

  // それ以降、同じ発動から二重発動しないこと
  tickSkill(kart, state, 5.0);
  assert(kart._boostCalls.length === 1, 'augment must not fire a second time for the same activation');
  print('PASS: stage-2 augment applies once, after the base skill duration ends');
}

// 4. 3段階達成: 追加ブーストが2秒に延長される
print('Test 4: stage-3 augment extends the bonus duration to 2 seconds...');
{
  const kart = makeFakeKart();
  const state = createSkillState('standard_red', true);
  const tracker = { appliedReward: { skillStageUnlocked: 3 } };
  activateSkill(kart, state, ROCKET_SKILL, tracker);
  tickSkill(kart, state, 3.1);
  assert(kart._boostCalls.length === 1, 'augment should fire once');
  assert(kart._boostCalls[0].dur === 2.0, 'stage3 augment duration should be extended to 2.0s');
  print('PASS: stage-3 augment extends the bonus duration to 2 seconds');
}

// 5. 発動中のスキルへは後付けしない: 前回発動の残留状態が次回発動時にクリアされる
print('Test 5: re-activating without a new augment clears stale pending state...');
{
  const kart = makeFakeKart();
  const state = createSkillState('standard_red', true);
  activateSkill(kart, state, ROCKET_SKILL, { appliedReward: { skillStageUnlocked: 3 } });
  assert(kart._pendingRocketAugment !== null, 'first activation should set a pending augment');

  // 同じ発動が終わる前に何らかの理由で再発動された場合でも、stage未解禁扱いなら残留させない
  activateSkill(kart, state, ROCKET_SKILL, { appliedReward: { skillStageUnlocked: 0 } });
  assert(kart._pendingRocketAugment === null, 'stale pending augment must be cleared on re-activation without a qualifying stage');
  print('PASS: re-activating without a new augment clears stale pending state');
}

// 6. マグネット・バリア: 発動終了時にhasShieldが解除される
print('Test 6: magnet_barrier clears hasShield when the skill naturally expires...');
{
  const kart = makeFakeKart({ hasShield: true });
  const state = createSkillState('handling_green', true);
  const skill = { id: 'magnet_barrier', cooldown: 18.0, duration: 6.0 };
  activateSkill(kart, state, skill, null);
  assert(kart.hasShield === true, 'hasShield should be set on activation');
  tickSkill(kart, state, 6.1);
  assert(kart.hasShield === false, 'hasShield should be cleared once the barrier duration ends');
  assert(state.activeType === null, 'activeType should be cleared');
  print('PASS: magnet_barrier clears hasShield when the skill naturally expires');
}

// 7. スカイ・グライダー: 発動時に実際に上昇する（その場で展開して滑空しない、の再発防止）
// physics.js の空中挙動は verticalSpeed フィールドのみを参照する（velocityY は存在せず無視される）。
print('Test 7: sky_glider sets the real verticalSpeed field (not a nonexistent velocityY)...');
{
  const kart = makeFakeKart({ verticalSpeed: 0, airTime: 5, gliderPitch: 0.8, gliderRoll: -0.5 });
  const state = createSkillState('speed_blue', true);
  const skill = { id: 'sky_glider', cooldown: 16.0, duration: 5.0 };
  activateSkill(kart, state, skill, null);
  assert(kart.isAirborne === true, 'sky_glider should set isAirborne');
  assert(kart.isGliding === true, 'sky_glider should set isGliding');
  assert(kart.verticalSpeed > 0, `sky_glider must set a positive verticalSpeed to actually launch upward (got ${kart.verticalSpeed})`);
  assert(kart.airTime === 0, 'airTime should reset to 0 on a fresh launch');
  assert(kart.gliderPitch === 0 && kart.gliderRoll === 0, 'glider attitude should reset to level on a fresh launch');
  assert(kart.velocityY === undefined, 'must not rely on the nonexistent velocityY field');
  print('PASS: sky_glider sets the real verticalSpeed field (not a nonexistent velocityY)');
}

print('');
print('ALL UNIQUE SKILLS TESTS PASSED!');
