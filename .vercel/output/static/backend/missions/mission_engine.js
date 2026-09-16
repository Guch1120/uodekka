// backend/missions/mission_engine.js
// ミッション抽選・進捗判定・報酬計算ロジック（描画非依存・THREE.js非依存）
import {
  getVehicleMissions,
  NumericBuffTable,
  AlternateRewardWhenLocked,
  RescueConfig,
  CPU_MISSION_MIN_LEVEL
} from './mission_definitions.js';

export function isCpuMissionEligible(frozenCpuLevel) {
  return (frozenCpuLevel || 1) >= CPU_MISSION_MIN_LEVEL;
}

export function drawMission(vehicleKey, capabilities = {}) {
  const pool = getVehicleMissions(vehicleKey).filter(m => {
    if (m.requiresOpponents && !capabilities.hasOpponents) return false;
    if (m.requiresCoins && !capabilities.hasCoins) return false;
    if (m.requiresItemBoxes && !capabilities.hasItemBoxes) return false;
    return true;
  });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export class MissionTracker {
  constructor(racerId, vehicleKey, capabilities = {}, presetMissionId = null) {
    this.racerId = racerId;
    this.vehicleKey = vehicleKey;
    this.capabilities = capabilities;

    let missionDef = null;
    if (presetMissionId) {
      missionDef = getVehicleMissions(vehicleKey).find(m => m.id === presetMissionId) || null;
    }
    if (!missionDef) {
      missionDef = drawMission(vehicleKey, capabilities);
    }
    this.missionDef = missionDef;
    this.missionId = missionDef ? missionDef.id : null;

    this.cumulativeProgress = 0;
    this.stage = 0;
    this.rescueActive = false;
    this.rescueKind = null;
    this.appliedReward = { altRewardAccelBonus: 0, skillStageUnlocked: 0 };
    this.isSkillUnlocked = false;

    // 内部ワーキングステート（同期・保存しない）
    this._accelArmed = false;
    this._lastOvertakeAt = new Map();
    this._pursuitPrevDiff = new Map();
    this._rescueLapCheckDone = false;
    this._rescueCooldownCutPending = false;

    // 表示用の一度きりの通知キュー（HUDの非ブロッキング通知が消費してクリアする）
    this.pendingNotifications = [];
  }

  addProgress(amount) {
    if (!amount || amount <= 0 || !this.missionDef) return;
    this.cumulativeProgress += amount;
    this._recomputeStage();
  }

  _recomputeStage() {
    const def = this.missionDef;
    if (!def) return;
    let newStage = 0;
    for (let i = 0; i < def.thresholds.length; i++) {
      if (this.cumulativeProgress >= def.thresholds[i]) newStage = i + 1;
    }
    if (newStage > this.stage) {
      for (let s = this.stage + 1; s <= newStage; s++) {
        this._onStageAdvanced(s);
      }
      this.stage = newStage;
    }
  }

  _onStageAdvanced(stage) {
    if (stage === 2 || stage === 3) {
      if (this.isSkillUnlocked) {
        this.appliedReward.skillStageUnlocked = stage;
      } else {
        this.appliedReward.altRewardAccelBonus = stage === 2
          ? AlternateRewardWhenLocked.stage2AccelBonus
          : AlternateRewardWhenLocked.stage3AccelBonus;
      }
    }
    this.pendingNotifications.push({ kind: 'stage', stage });
  }

  // --- 離散イベントフック ---

  onCoinCollected() {
    if (this.missionDef?.metric === 'coinLineCount') this.addProgress(1);
  }

  onItemConsumed() {
    if (this.missionDef?.metric === 'itemOpsCount') this.addProgress(1);
  }

  onHitLanded() {
    if (this.missionDef?.metric === 'pressureDrivingPoints') this.addProgress(3);
  }

  onTurboSuccess(level) {
    if (this.missionDef?.metric === 'turboCraftsmanPoints') this.addProgress(level === 2 ? 2 : 1);
  }

  onLapEntered(lapNumber) {
    if (lapNumber !== 3 || this._rescueLapCheckDone) return;
    this._rescueLapCheckDone = true;
    if (this.stage > 0) return;
    this.rescueActive = true;
    this.rescueKind = this.isSkillUnlocked ? 'unlocked' : 'locked';
    if (this.rescueKind === 'unlocked') {
      this._rescueCooldownCutPending = true;
    }
    this.pendingNotifications.push({ kind: 'rescue', rescueKind: this.rescueKind });
  }

  // --- 連続系ティック ---

  tick(physics, dt, inputState, gameState) {
    if (!this.missionDef) return;
    const speedRatio = Math.abs(physics.speed) / (physics.maxSpeed || 1);
    const legal = !physics.isWrongWay && !physics.isSpinning && !physics.isRespawning && !physics.isFinished;
    if (!legal) {
      this._accelArmed = false;
      return;
    }
    const grounded = !physics.isAirborne;

    switch (this.missionDef.metric) {
      case 'accelRecoveryCount':
        if (speedRatio < 0.5) {
          this._accelArmed = true;
        } else if (this._accelArmed && speedRatio >= 0.9) {
          this._accelArmed = false;
          this.addProgress(1);
        }
        break;
      case 'boostRunSeconds':
        if (speedRatio > 1.0) this.addProgress(dt);
        break;
      case 'pursuitChargePoints':
        this._tickPursuitCharge(physics, dt, speedRatio, gameState);
        break;
      case 'highSpeedCruiseSeconds':
        if (speedRatio >= 0.9) this.addProgress(dt);
        break;
      case 'topHalfKeepPoints':
        this._tickTopHalfKeep(physics, dt, speedRatio, gameState);
        break;
      case 'straightMasterySeconds':
        if (grounded && speedRatio >= 0.85 && Math.abs(inputState?.steering || 0) <= 0.2) this.addProgress(dt);
        break;
      case 'cornerRhythmSeconds':
        if (grounded && physics.isDrifting && speedRatio >= 0.6) this.addProgress(dt);
        break;
      case 'pressureDrivingPoints':
        this._tickPressureDriving(physics, dt, speedRatio, gameState);
        break;
      case 'heavyCruisePoints':
        if (grounded && speedRatio >= 0.75) this.addProgress((physics.holdingItem ? 1.5 : 1.0) * dt);
        break;
      default:
        // turboCraftsmanPoints / coinLineCount / itemOpsCount は離散フックのみで加算する
        break;
    }
  }

  _getOpponentPhysics(gameState, myPhysics) {
    const list = [];
    if (!gameState) return list;
    if (gameState.localPlayerKart && gameState.localPlayerKart !== myPhysics) {
      list.push(gameState.localPlayerKart);
    }
    gameState.otherPlayers?.forEach(p => {
      if (p.physics && p.physics !== myPhysics) list.push(p.physics);
    });
    return list;
  }

  _tickPursuitCharge(physics, dt, speedRatio, gameState) {
    const opponents = this._getOpponentPhysics(gameState, physics);
    if (opponents.length === 0) return;
    const myScore = physics.currentLap + physics.progress;
    const now = performance.now();
    let nearestAheadDist = Infinity;

    for (const opp of opponents) {
      if (!opp || opp.isRespawning) continue;
      const oppScore = opp.currentLap + opp.progress;
      const diff = myScore - oppScore;
      const prevDiff = this._pursuitPrevDiff.get(opp.id);
      if (prevDiff !== undefined && prevDiff < 0 && diff >= 0) {
        const lastAt = this._lastOvertakeAt.get(opp.id) || 0;
        if (now - lastAt >= 5000) {
          this._lastOvertakeAt.set(opp.id, now);
          this.addProgress(3);
        }
      }
      this._pursuitPrevDiff.set(opp.id, diff);

      if (diff < 0) {
        const dist = physics.mesh.position.distanceTo(opp.mesh.position);
        if (dist < nearestAheadDist) nearestAheadDist = dist;
      }
    }

    if (nearestAheadDist <= 20 && speedRatio >= 0.7) this.addProgress(dt);
  }

  _tickTopHalfKeep(physics, dt, speedRatio, gameState) {
    const rankings = gameState?.calculateRankings ? gameState.calculateRankings() : [];
    if (rankings.length === 0) return;
    const rank = rankings.indexOf(physics) + 1;
    if (rank === 0) return;
    const total = rankings.length;
    if (rank <= total / 2) {
      this.addProgress(2 * dt);
    } else if (speedRatio >= 0.85) {
      this.addProgress(1 * dt);
    }
  }

  _tickPressureDriving(physics, dt, speedRatio, gameState) {
    const opponents = this._getOpponentPhysics(gameState, physics);
    if (opponents.length === 0) return;
    let nearestDist = Infinity;
    for (const opp of opponents) {
      if (!opp || opp.isRespawning) continue;
      const dist = physics.mesh.position.distanceTo(opp.mesh.position);
      if (dist < nearestDist) nearestDist = dist;
    }
    if (nearestDist <= 10 && speedRatio >= 0.6) this.addProgress(dt);
  }

  // --- 報酬計算 ---

  _numericBuffRatio(stat) {
    const entries = NumericBuffTable[this.vehicleKey] || [];
    const entry = entries.find(e => e.stat === stat);
    if (!entry || !this.missionDef) return 0;
    const thresholds = this.missionDef.thresholds;
    const completed = Math.min(3, this.stage);
    let partial = 0;
    if (this.stage < 3) {
      const prev = this.stage === 0 ? 0 : thresholds[this.stage - 1];
      const next = thresholds[this.stage];
      const span = next - prev;
      partial = span > 0 ? Math.max(0, Math.min(1, (this.cumulativeProgress - prev) / span)) : 0;
    }
    return entry.maxRatio * ((completed + partial) / 3);
  }

  applyToPhysics(physics, vehicleConfig, isSkillUnlocked) {
    const rescueAccel = (this.rescueActive && this.rescueKind === 'locked') ? RescueConfig.lockedAccelBonus : 0;
    const rescueTopSpeed = (this.rescueActive && this.rescueKind === 'locked') ? RescueConfig.lockedTopSpeedBonus : 0;
    const altAccel = isSkillUnlocked ? 0 : (this.appliedReward.altRewardAccelBonus || 0);

    physics.missionAccelMult = 1 + this._numericBuffRatio('acceleration') + rescueAccel + altAccel;
    physics.missionTopSpeedMult = 1 + this._numericBuffRatio('topSpeed') + rescueTopSpeed;
    physics.missionDriftDurationMult = 1 + this._numericBuffRatio('miniTurboDuration');
    physics.missionSkillCooldownMult = (this.rescueActive && this.rescueKind === 'unlocked')
      ? (1 - RescueConfig.unlockedCooldownCutRatio)
      : 1;
  }
}
