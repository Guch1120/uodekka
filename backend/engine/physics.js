// backend/engine/physics.js
// カートの走行力学（パラメータ制御：加速度・最高速・慣性減速・ブレーキ・ダート減速・デウス復帰・アンチグリッチ・アイテム後方保持）
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { Items } from '../../frontend/items/items.js';

export class KartPhysics {
  constructor(mesh, config = {}, isLocal = false) {
    this.mesh = mesh;
    this.isLocalPlayer = isLocal;
    this.id = Math.random().toString(36).substring(2, 9);

    // 物理パラメータ
    this.maxSpeed = config.topSpeed || 42.0;
    this.acceleration = config.acceleration || 24.0;
    this.brakeForce = config.brakeForce || 36.0;
    this.inertiaDamping = config.inertiaDamping || 1.4;
    this.offroadFriction = config.offroadFriction || 0.35;
    this.handling = config.handling || 1.5;
    this.driftMultiplier = config.driftMultiplier || 1.25;

    // 状態変数
    this.speed = 0;
    this.steerAngle = 0;
    this.driftTime = 0;
    this.isDrifting = false;
    this.driftDirection = 0;
    this.isSpinning = false;
    this.spinTimer = 0;

    this.boostTimer = 0;
    this.boostMultiplier = 1.0;
    this.invincibleTimer = 0;

    // サンダーによるスモール化状態
    this.isSmall = false;
    this.smallTimer = 0;

    // ドリフト火花レベル (0: なし, 1: 青ミニターボ, 2: 橙スーパーミニターボ)
    this.driftSparkLevel = 0;

    // レース進行状態 & アンチグリッチ
    this.currentLap = 1;
    this.totalLaps = 3;
    this.progress = 0;
    this.highestProgressThisLap = 0;
    this.lastSafeT = 0;
    this.isFinished = false;
    this.finishTime = 0;
    this.isWrongWay = false;

    // デウス・エクス・マキナ 復帰状態
    this.isRespawning = false;
    this.respawnTimer = 0;
    this.respawnTargetPos = new THREE.Vector3();
    this.respawnTargetQuat = new THREE.Quaternion();

    // アイテム関連
    this.holdingItem = null;
    this.trailingItemMesh = null;

    this.position = this.mesh.position;
    this.rotation = this.mesh.quaternion;
  }

  update(dt, inputState, courseSpline, trackWidth = 32, gameState = null) {
    // 1. デウス・エクス・マキナ 復帰シーケンス中の挙動
    if (this.isRespawning) {
      this.respawnTimer -= dt;
      this.speed = 0;

      // カートを浮遊させながら目標コース地点へスムーズに空中移動
      const hoverHeight = 3.5 + Math.sin(performance.now() * 0.008) * 0.6;
      const targetHover = this.respawnTargetPos.clone();
      targetHover.y += hoverHeight;

      this.mesh.position.lerp(targetHover, dt * 4.0);
      this.mesh.quaternion.slerp(this.respawnTargetQuat, dt * 6.0);

      if (this.respawnTimer <= 0) {
        this.isRespawning = false;
        this.mesh.position.copy(this.respawnTargetPos);
        this.mesh.quaternion.copy(this.respawnTargetQuat);

        // ★重要: 復帰直後に回転オイラー角を正規化（Pitch=0, Roll=0）して反転バグを根絶
        const yaw = Math.atan2(
          2 * (this.mesh.quaternion.w * this.mesh.quaternion.y),
          1 - 2 * (this.mesh.quaternion.y * this.mesh.quaternion.y)
        );
        this.mesh.rotation.set(0, yaw, 0, 'YXZ');
        this.speed = 0;
      }
      return;
    }

    // 2. スピン演出（カメラは追従せず、カート本体のみY軸回転）
    if (this.isSpinning) {
      this.spinTimer -= dt;
      this.mesh.rotateY(dt * 18.0);
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 4.0);
      if (this.spinTimer <= 0) {
        this.isSpinning = false;
        if (courseSpline) {
          const tangent = courseSpline.getTangentAt(this.progress).normalize();
          const yaw = Math.atan2(-tangent.x, -tangent.z);
          this.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          this.mesh.rotation.set(0, yaw, 0, 'YXZ');
        }
      }
      return;
    }

    // ブースト減衰
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.boostMultiplier = 1.0;
      }
    }

    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
    }

    // サンダーによるスモール化減衰とスケール復帰
    if (this.smallTimer > 0) {
      this.smallTimer -= dt;
      if (this.smallTimer <= 0) {
        this.isSmall = false;
        this.mesh.scale.set(1.0, 1.0, 1.0);
        if (this.isLocalPlayer && gameState) {
          gameState.showItemNotification('元のサイズに戻った！');
        }
      } else {
        this.mesh.scale.set(0.55, 0.55, 0.55);
      }
    } else {
      this.isSmall = false;
      this.mesh.scale.set(1.0, 1.0, 1.0);
    }

    // 3. アイテム後方保持
    this.updateItemHolding(inputState, gameState);

    // 4. 加速・ブレーキ・慣性減速
    const accelInput = inputState.accelerating;
    const brakeInput = inputState.braking;
    
    // スモール化時は最高速度と加速度が45%低下
    const smallSpeedFactor = this.isSmall ? 0.55 : 1.0;
    const currentMaxSpeed = this.maxSpeed * this.boostMultiplier * smallSpeedFactor;
    const currentAccel = this.acceleration * smallSpeedFactor;

    if (accelInput > 0) {
      this.speed += currentAccel * accelInput * dt;
    } else if (brakeInput > 0) {
      this.speed -= this.brakeForce * brakeInput * dt;
    } else {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * this.inertiaDamping);
    }

    this.speed = Math.max(-12, Math.min(currentMaxSpeed, this.speed));

    // 5. コース判定 & ダート摩擦減速 & コースアウト
    let nearestT = 0;
    if (courseSpline) {
      nearestT = this.findNearestTrackT(courseSpline, this.mesh.position);
      const trackCenter = courseSpline.getPointAt(nearestT);
      const distFromCenter = new THREE.Vector2(
        this.mesh.position.x - trackCenter.x,
        this.mesh.position.z - trackCenter.z
      ).length();

      const halfWidth = trackWidth / 2;

      if (distFromCenter <= halfWidth) {
        this.lastSafeT = nearestT;
        this.updateLegitimateProgress(nearestT);
      } else {
        if (this.invincibleTimer <= 0) {
          const dirtSpeedLimit = this.maxSpeed * this.offroadFriction;
          if (this.speed > dirtSpeedLimit) {
            this.speed = THREE.MathUtils.lerp(this.speed, dirtSpeedLimit, dt * 4.0);
          }
        }

        const outOfBoundsLimit = halfWidth + 16.0;
        if (distFromCenter > outOfBoundsLimit || this.mesh.position.y < -15.0) {
          this.triggerDeusExMachinaRescue(courseSpline, gameState);
          return;
        }
      }

      // 逆走判定
      const courseTangent = courseSpline.getTangentAt(nearestT).normalize();
      const kartForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
      const dot = courseTangent.dot(kartForward);
      this.isWrongWay = (dot < -0.35 && Math.abs(this.speed) > 5.0);
    }

    // 6. ドリフト制御 (ミニターボ / スーパーミニターボ)
    if (inputState.drift && Math.abs(inputState.steering) > 0.2 && Math.abs(this.speed) > 12) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftDirection = Math.sign(inputState.steering);
        this.driftTime = 0;
      }
      this.driftTime += dt;

      // ドリフト継続時間に応じたスパークレベル
      if (this.driftTime > 1.6) {
        this.driftSparkLevel = 2; // オレンジ（スーパーミニターボ）
      } else if (this.driftTime > 0.7) {
        this.driftSparkLevel = 1; // 青（ミニターボ）
      } else {
        this.driftSparkLevel = 0;
      }
    } else {
      if (this.isDrifting) {
        // ドリフト終了時にスパークに応じた急加速
        if (this.driftSparkLevel === 2) {
          this.applyBoost(1.5, 1.8);
          if (this.isLocalPlayer && gameState) {
            gameState.showItemNotification('🔥 スーパーミニターボ発動！', 1500);
          }
        } else if (this.driftSparkLevel === 1) {
          this.applyBoost(1.3, 1.0);
          if (this.isLocalPlayer && gameState) {
            gameState.showItemNotification('⚡ ミニターボ発動！', 1200);
          }
        }
        this.isDrifting = false;
        this.driftSparkLevel = 0;
      }
    }

    // 7. ステアリング旋回 (ローカルY軸回転: rotateY を使用して上下反転時でも常に自分の頭上軸で旋回)
    let steerRate = this.handling;
    if (this.isDrifting) {
      steerRate *= this.driftMultiplier;
    }

    const speedFactor = Math.min(1.0, Math.abs(this.speed) / 10.0);
    const steerDelta = -inputState.steering * steerRate * speedFactor * dt;
    this.mesh.rotateY(steerDelta);

    if (this.mesh.userData && this.mesh.userData.wheels) {
      const wheels = this.mesh.userData.wheels;
      if (wheels[0] && wheels[1]) {
        wheels[0].rotation.y = -inputState.steering * 0.4;
        wheels[1].rotation.y = -inputState.steering * 0.4;
      }
    }

    // 8. 前進
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    this.mesh.position.addScaledVector(forward, this.speed * dt);

    // 高さ追従
    if (courseSpline) {
      const trackPoint = courseSpline.getPointAt(nearestT);
      this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, trackPoint.y + 0.35, dt * 10);
      this.updateLapProgress(nearestT);
    }
  }

  updateItemHolding(inputState, gameState) {
    if (!this.holdingItem) {
      this.removeTrailingMesh(gameState);
      return;
    }

    if (inputState.itemHeld && this.holdingItem.canHoldBehind) {
      if (!this.trailingItemMesh && gameState) {
        this.trailingItemMesh = Items.createTrailingItemMesh(this.holdingItem.id);
        gameState.scene.add(this.trailingItemMesh);
      }
      if (this.trailingItemMesh) {
        const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        this.trailingItemMesh.position.copy(this.mesh.position).addScaledVector(backward, 2.2);
        this.trailingItemMesh.position.y = this.mesh.position.y + 0.3;
        this.trailingItemMesh.quaternion.copy(this.mesh.quaternion);
      }
    } else {
      this.removeTrailingMesh(gameState);
    }
  }

  removeTrailingMesh(gameState) {
    if (this.trailingItemMesh && gameState) {
      gameState.scene.remove(this.trailingItemMesh);
      this.trailingItemMesh = null;
    }
  }

  triggerDeusExMachinaRescue(courseSpline, gameState) {
    if (this.isRespawning) return;

    this.isRespawning = true;
    this.respawnTimer = 2.0;
    this.speed = 0;
    this.removeTrailingMesh(gameState);

    const restoreT = this.lastSafeT || 0.01;
    const trackCenter = courseSpline.getPointAt(restoreT);
    const forward = courseSpline.getTangentAt(restoreT).normalize();

    this.respawnTargetPos.set(trackCenter.x, trackCenter.y + 0.4, trackCenter.z);

    // ★重要: 水平方向のYaw角からクォータニオンを厳密に生成 (Roll=0, Pitch=0を保証)
    const yaw = Math.atan2(-forward.x, -forward.z);
    this.respawnTargetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    this.progress = restoreT;
  }

  updateLegitimateProgress(t) {
    // スプライン上の正当な前進チェック (ショートカット不正防止)
    const delta = t - this.progress;
    if ((delta > 0 && delta < 0.15) || (this.progress > 0.8 && t < 0.2)) {
      this.progress = t;
      if (t > this.highestProgressThisLap && t < 0.95) {
        this.highestProgressThisLap = t;
      }
    }
  }

  updateLapProgress(t) {
    if (this.isFinished) return;
    // 1周の後半(>0.7)を通過した状態でスタートライン(t < 0.15 または 0境界通過)を横切った場合
    if ((this.progress > 0.8 || this.highestProgressThisLap > 0.7) && t < 0.15) {
      this.currentLap++;
      this.highestProgressThisLap = 0;
      this.progress = t;
      if (this.currentLap > this.totalLaps) {
        this.isFinished = true;
        this.finishTime = performance.now();
      }
    }
  }

  findNearestTrackT(curve, pos) {
    let bestT = 0;
    let minDist = Infinity;
    const samples = 80;
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const pt = curve.getPointAt(t);
      const d = pos.distanceToSquared(pt);
      if (d < minDist) {
        minDist = d;
        bestT = t;
      }
    }
    return bestT;
  }

  applyBoost(multiplier, duration) {
    this.boostMultiplier = Math.max(this.boostMultiplier, multiplier);
    this.boostTimer = Math.max(this.boostTimer, duration);
  }

  applyInvincible(duration) {
    this.invincibleTimer = Math.max(this.invincibleTimer, duration);
    this.applyBoost(1.35, duration);
  }

  spinOut() {
    if (this.invincibleTimer > 0 || this.isSpinning || this.isRespawning) return;
    this.isSpinning = true;
    this.spinTimer = 1.2;
    this.speed = this.speed * 0.2;
  }

  applySmall(duration) {
    if (this.invincibleTimer > 0 || this.isRespawning) return;
    this.isSmall = true;
    this.smallTimer = Math.max(this.smallTimer, duration);
    this.mesh.scale.set(0.55, 0.55, 0.55);
  }
}
