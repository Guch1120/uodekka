// backend/skills/unique_skills.js
// 車体固有スキルの発動・更新ロジック（レーサー単位、プレイヤー・CPU共通で使用する）
import { SkillStageEffects } from '../missions/mission_definitions.js';

export function createSkillState(vehicleKey, isUnlocked = false) {
  return {
    vehicleKey,
    isUnlocked,
    cooldown: 0,
    activeTimer: 0,
    activeType: null
  };
}

// 固有スキル発動。missionTrackerが2段階/3段階の追加効果を解放済みなら、
// 発動中は後付けせず「次回発動から」その追加効果を予約する（kartへ_pendingXxxとして仕込む）。
export function activateSkill(kart, skillState, skill, missionTracker) {
  if (!skill) return null;

  skillState.cooldown = (skill.cooldown || 15.0) * (kart.missionSkillCooldownMult || 1);
  skillState.activeTimer = skill.duration || 3.0;
  skillState.activeType = skill.id;

  const stage = missionTracker?.appliedReward?.skillStageUnlocked || 0;
  const effectDef = SkillStageEffects[skill.id];
  const augment = (stage >= 2 && effectDef) ? (stage >= 3 ? effectDef.stage3 : effectDef.stage2) : null;

  kart._pendingRocketAugment = null;
  kart._pendingLandingBoost = null;
  kart._pendingBarrierAugment = null;
  kart._pendingGigaAugment = null;

  if (skill.id === 'rocket_charge') {
    kart.speed = Math.max(kart.speed * 1.5, kart.maxSpeed * 1.6);
    kart.boostTimer = 3.0;
    kart.boostMultiplier = 1.6;
    kart._pendingRocketAugment = augment;
  } else if (skill.id === 'sky_glider') {
    kart.isAirborne = true;
    kart.isGliding = true;
    kart.airTime = 0;
    kart.gliderPitch = 0;
    kart.gliderRoll = 0;
    // 物理層(physics.js)は verticalSpeed で上下運動を扱う。velocityY は存在しないフィールドで
    // 読み取られないため、その場に留まったまま(実質上昇せずに)着地判定に入り滑空しなかった。
    kart.verticalSpeed = 18.0;
    kart.speed = Math.max(kart.speed, kart.maxSpeed * 1.25);
    const gMesh = kart.mesh.userData?.gliderMesh;
    if (gMesh) gMesh.visible = true;
    kart._pendingLandingBoost = augment;
  } else if (skill.id === 'magnet_barrier') {
    kart.hasShield = true;
    kart._pendingBarrierAugment = augment;
  } else if (skill.id === 'giga_stampede') {
    kart.invincibleTimer = 4.5;
    kart.isGigaStampede = true;
    kart.speed = Math.max(kart.speed * 1.25, kart.maxSpeed * 1.35);
    kart.mesh.scale.set(1.45, 1.45, 1.45);
    kart._pendingGigaAugment = augment;
  }

  return skill.id;
}

// 毎フレームのクールダウン・持続時間の更新（AoE等レース状態を要する副作用は呼び出し側で行う）
export function tickSkill(kart, skillState, dt) {
  if (skillState.cooldown > 0) {
    skillState.cooldown = Math.max(0, skillState.cooldown - dt);
  }
  if (skillState.activeTimer > 0) {
    skillState.activeTimer -= dt;
    if (skillState.activeTimer <= 0) {
      _onSkillExpired(kart, skillState);
    }
  }
}

function _onSkillExpired(kart, skillState) {
  const type = skillState.activeType;

  if (type === 'rocket_charge' && kart._pendingRocketAugment) {
    const aug = kart._pendingRocketAugment;
    kart.applyBoost(aug.multiplier, aug.duration);
  }
  if (type === 'giga_stampede') {
    kart.mesh.scale.set(1.0, 1.0, 1.0);
    kart.isGigaStampede = false;
    if (kart._pendingGigaAugment) {
      const aug = kart._pendingGigaAugment;
      kart.applyBoost(aug.multiplier, aug.duration);
    }
  }
  if (type === 'magnet_barrier') {
    kart.hasShield = false;
  }

  kart._pendingRocketAugment = null;
  kart._pendingGigaAugment = null;
  skillState.activeType = null;
}
