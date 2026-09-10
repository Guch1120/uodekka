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

    // うんちの異臭パワーによる減速状態
    this.stinkTimer = 0;
    this.stinkEffectMesh = null;

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

    // ジャンプ＆グライダー滑空状態
    this.isAirborne = false;
    this.isGliding = false;
    this.verticalSpeed = 0;
    this.airTime = 0;
    this.gliderPitch = 0; // -1.0 (機首下げダイブ) 〜 +1.0 (機首上げ揚力)
    this.gliderRoll = 0;  // -1.0 (左バンク) 〜 +1.0 (右バンク)

    // アイテム関連
    this.holdingItem = null;
    this.trailingItemMesh = null;

    // コイン & レース内ローグライクスキル
    this.coins = 0;
    this.inRacePerks = {};
    this.nextPerkThreshold = 3;

    this.position = this.mesh.position;
    this.rotation = this.mesh.quaternion;
  }

  triggerJump(jumpForce = 16.0, boostMult = 1.5, boostDuration = 2.0, ramp = null) {
    this.isAirborne = true;
    this.isGliding = false;
    let vSpeed = jumpForce;
    if (ramp && ramp.rampAngle) {
      vSpeed = Math.max(jumpForce, 14.0 + Math.sin(ramp.rampAngle) * 22.0);
    }
    this.verticalSpeed = vSpeed;
    this.airTime = 0;
    this.applyBoost(boostMult, boostDuration);
    this.speed = Math.max(this.speed * 1.35, this.maxSpeed * 1.35);
    if (this.mesh.userData && this.mesh.userData.gliderMesh) {
      this.mesh.userData.gliderMesh.visible = false;
    }
  }

  triggerGlider(launchSpeed = 18.0, boostMult = 1.6, boostDuration = 3.5, ramp = null) {
    this.isAirborne = true;
    this.isGliding = true;
    this.airTime = 0;
    this.gliderPitch = 0;
    this.gliderRoll = 0;

    // ジャンプ台の角度方向（Launch Direction）への射出初速ベクトル
    let vy = launchSpeed;
    let forwardSpeedBoost = 54.0;

    if (ramp) {
      const angle = ramp.rampAngle || 0.40; // 約23度
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      // 斜面角度方向に沿って総合初速54〜60m/sでバランス良く打ち出し
      const launchMagnitude = Math.max(this.speed * 1.35, 56.0);
      forwardSpeedBoost = launchMagnitude * cosA;
      vy = Math.min(22.0, Math.max(launchSpeed, launchMagnitude * sinA));
    }

    this.verticalSpeed = vy;
    this.speed = Math.max(this.speed, forwardSpeedBoost);
    this.applyBoost(boostMult, boostDuration);

    if (this.mesh.userData && this.mesh.userData.gliderMesh) {
      this.mesh.userData.gliderMesh.visible = true;
    }
  }

  getRoadY(curve, t, pos) {
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const horizontalSq = tangent.x * tangent.x + tangent.z * tangent.z;
    if (horizontalSq < 0.0001) return center.y + 0.35;
    const grade = tangent.y / horizontalSq;
    return center.y + 0.35 +
      ((pos.x - center.x) * tangent.x + (pos.z - center.z) * tangent.z) * grade;
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

    // 2-2. 異臭パワーによる減速効果（うんち被弾・周囲巻き込み）
    if (this.stinkTimer > 0) {
      this.stinkTimer -= dt;
      if (this.stinkEffectMesh) {
        this.stinkEffectMesh.rotation.y += dt * 3.0;
        this.stinkEffectMesh.position.y = Math.sin(performance.now() * 0.006) * 0.1;
      }
      if (this.stinkTimer <= 0) {
        this.stinkTimer = 0;
        if (this.stinkEffectMesh) {
          this.mesh.remove(this.stinkEffectMesh);
          this.stinkEffectMesh = null;
        }
        if (this.isLocalPlayer && gameState) {
          gameState.showItemNotification('異臭が晴れた！通常速度に回復！');
        }
      }
    }

    // 3. アイテム後方保持
    this.updateItemHolding(inputState, gameState);

    // 4. 加速・ブレーキ・慣性減速
    const accelInput = inputState.accelerating;
    const brakeInput = inputState.braking;
    
    // スモール化時は最高速度と加速度が45%低下
    const smallSpeedFactor = this.isSmall ? 0.55 : 1.0;
    // 異臭パワー時は最高速度と加速度が45%低下
    const stinkSpeedFactor = this.stinkTimer > 0 ? 0.55 : 1.0;
    const perkSpeedFactor = 1 + (this.perkTopSpeedBoost || 0);
    const perkAccelFactor = 1 + (this.perkAccelBoost || 0);
    const baseSpeedWithCoins = (this.maxSpeed + (this.coinBonusSpeed || 0)) * perkSpeedFactor;
    const currentMaxSpeed = baseSpeedWithCoins * this.boostMultiplier * smallSpeedFactor * stinkSpeedFactor;
    const currentAccel = this.acceleration * perkAccelFactor * smallSpeedFactor * stinkSpeedFactor;

    if (brakeInput > 0) {
      if (this.speed > 0) {
        // 前進中の減速ブレーキ（押下時から即座に急減速）
        this.speed -= this.brakeForce * brakeInput * dt;
      } else {
        // 速度が0未満になるとバック（後退）加速
        const reverseAccel = currentAccel * 0.75;
        this.speed -= reverseAccel * brakeInput * dt;
      }
    } else if (accelInput > 0) {
      if (this.speed < 0) {
        // バック中からアクセルを踏んだ場合の即時前進ブレーキ
        this.speed += this.brakeForce * accelInput * dt;
      } else {
        this.speed += currentAccel * accelInput * dt;
      }
    } else {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * this.inertiaDamping);
    }

    this.speed = Math.max(-12.0, Math.min(currentMaxSpeed, this.speed));

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
      } else {
        if (!this.isAirborne && this.invincibleTimer <= 0) {
          const dirtSpeedLimit = this.maxSpeed * this.offroadFriction;
          if (this.speed > dirtSpeedLimit) {
            this.speed = THREE.MathUtils.lerp(this.speed, dirtSpeedLimit, dt * 4.0);
          }
        }

        const outOfBoundsLimit = this.isGliding ? (halfWidth + 60.0) : (this.isAirborne ? halfWidth + 30.0 : halfWidth + 16.0);
        if (distFromCenter > outOfBoundsLimit || this.mesh.position.y < -25.0) {
          this.triggerDeusExMachinaRescue(courseSpline, gameState);
          return;
        }
      }

      this.updateLegitimateProgress(nearestT);

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
        const durationMult = this.perkDriftBoost || 1.0;
        if (this.driftSparkLevel === 2) {
          this.applyBoost(1.5, 1.8 * durationMult);
          if (this.isLocalPlayer && gameState) {
            gameState.showItemNotification('🔥 スーパーミニターボ発動！', 1500);
          }
        } else if (this.driftSparkLevel === 1) {
          this.applyBoost(1.3, 1.0 * durationMult);
          if (this.isLocalPlayer && gameState) {
            gameState.showItemNotification('⚡ ミニターボ発動！', 1200);
          }
        }
        this.isDrifting = false;
        this.driftSparkLevel = 0;
      }
    }

    // 7. ワールドY軸で旋回し、路面の傾きは移動後に再計算
    let steerRate = this.handling;
    if (this.isDrifting) {
      steerRate *= this.driftMultiplier;
    }

    const steerDirectionSign = this.speed < -0.5 ? -1 : 1;
    const speedFactor = Math.min(1.0, Math.abs(this.speed) / 10.0);
    const steerDelta = -inputState.steering * steerRate * speedFactor * dt * steerDirectionSign;
    this.mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), steerDelta);

    if (this.mesh.userData && this.mesh.userData.wheels) {
      const wheels = this.mesh.userData.wheels;
      if (wheels[0] && wheels[1]) {
        wheels[0].rotation.y = -inputState.steering * 0.4;
        wheels[1].rotation.y = -inputState.steering * 0.4;
      }
    }

    // 8. 前進移動
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    this.mesh.position.addScaledVector(forward, this.speed * dt);

    // 9. 空中挙動制御（通常ジャンプ & グライダー滑空）
    if (this.isAirborne) {
      if (this.isGliding) {
        // グライダー滑空制御
        const pitchIn = inputState.pitch || 0;

        // 空中前進速度の自然な推移（過剰な固定を解除し、自然なエアドラッグを適用）
        if (this.speed > this.maxSpeed * 1.25) {
          this.speed = THREE.MathUtils.lerp(this.speed, this.maxSpeed * 1.25, dt * 0.8);
        }

        if (this.verticalSpeed > 0 && pitchIn >= -0.1) {
          // --- 上昇フェーズ: ジャンプ台射出の勢いで大空へホップ ---
          // 重力加速度 16.0 m/s² (前入力時は 12.0 m/s²) でスムーズに頂点へ
          let ascentGravity = 16.0;
          if (pitchIn > 0.1) {
            ascentGravity = 12.0;
            this.gliderPitch = THREE.MathUtils.lerp(this.gliderPitch, 1.0, dt * 5.0);
          } else {
            this.gliderPitch = THREE.MathUtils.lerp(this.gliderPitch, 0.0, dt * 3.5);
          }
          this.verticalSpeed -= ascentGravity * dt;
        } else {
          // --- 滑空フェーズ (自然落下ほど急激ではないが、着地に向けて確実に降下) ---
          if (pitchIn > 0.1) {
            // 前入力: 機首上げ（翼の揚力で落下に抗うが、-2.8m/sで緩やかに確実に降下）
            const liftTarget = -2.8;
            this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, liftTarget, dt * 3.2);
            this.gliderPitch = THREE.MathUtils.lerp(this.gliderPitch, 1.0, dt * 5.0);
          } else if (pitchIn < -0.1) {
            // 後ろ入力: 機首下げ（急降下ダイブ）
            const diveTarget = -18.0;
            this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, diveTarget, dt * 5.0);
            this.gliderPitch = THREE.MathUtils.lerp(this.gliderPitch, -1.0, dt * 5.0);
            this.speed = Math.min(68.0, this.speed + 30.0 * dt);
          } else {
            // ニュートラル: 標準滑空降下（-5.5m/sでスムーズに路面へ降りていく）
            const targetVy = -5.5;
            this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, targetVy, dt * 2.5);
            this.gliderPitch = THREE.MathUtils.lerp(this.gliderPitch, 0.0, dt * 3.5);
          }
        }

        // 左右入力による横滑空スライド
        const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
        this.mesh.position.addScaledVector(rightVec, -inputState.steering * 16.0 * dt);
        this.gliderRoll = THREE.MathUtils.lerp(this.gliderRoll, -inputState.steering * 0.5, dt * 7.0);
      } else {
        // 通常ジャンプ: 重力加速度による放物線
        this.verticalSpeed -= 30.0 * dt;
      }

      this.mesh.position.y += this.verticalSpeed * dt;
      this.airTime += dt;
    }

    // 高さ追従 & 着地判定
    if (courseSpline) {
      nearestT = this.findNearestTrackT(courseSpline, this.mesh.position);
      this.alignToTrack(courseSpline, nearestT);
      this.updateLapProgress(nearestT);
    }
  }

  alignToTrack(curve, t) {
    const center = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
    const horizontalSq = tangent.x * tangent.x + tangent.z * tangent.z;
    if (horizontalSq < 0.0001) return;
    const grade = tangent.y / horizontalSq;
    const normal = new THREE.Vector3(-tangent.x * grade, 1, -tangent.z * grade).normalize();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    forward.y = -(normal.x * forward.x + normal.z * forward.z) / normal.y;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, normal).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, normal, forward.clone().negate());

    const roadY = center.y + 0.35 +
      ((this.mesh.position.x - center.x) * tangent.x + (this.mesh.position.z - center.z) * tangent.z) * grade;

    if (this.isAirborne) {
      // 空中滞空時：Y座標は上空を飛行し、路面以下になったら着地
      const canLand = this.isGliding
        ? (this.airTime > 0.3 && this.verticalSpeed <= 0 && this.mesh.position.y <= roadY + 0.1)
        : (this.airTime > 0.2 && this.mesh.position.y <= roadY);

      if (canLand) {
        // 着地！
        this.mesh.position.y = roadY;
        this.isAirborne = false;
        this.isGliding = false;
        this.verticalSpeed = 0;
        this.airTime = 0;
        this.gliderPitch = 0;
        this.gliderRoll = 0;
        if (this.mesh.userData && this.mesh.userData.gliderMesh) {
          this.mesh.userData.gliderMesh.visible = false;
        }
        this.mesh.quaternion.setFromRotationMatrix(basis);
      } else {
        // 空中での姿勢制御（ピッチ＆ロール傾斜）
        this.mesh.quaternion.setFromRotationMatrix(basis);
        const pitchAngle = this.isGliding
          ? (-this.gliderPitch * 0.38)
          : (-Math.atan2(this.verticalSpeed, Math.max(12, this.speed)) * 0.35);
        const rollAngle = this.isGliding ? this.gliderRoll : 0;

        this.mesh.rotateX(pitchAngle);
        if (rollAngle !== 0) {
          this.mesh.rotateZ(rollAngle);
        }
      }
    } else {
      // 通常走行時：路面に密着
      this.mesh.quaternion.setFromRotationMatrix(basis);
      this.mesh.position.y = roadY;
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
    this.isAirborne = false;
    this.isGliding = false;
    this.verticalSpeed = 0;
    this.airTime = 0;
    this.gliderPitch = 0;
    this.gliderRoll = 0;
    if (this.mesh.userData && this.mesh.userData.gliderMesh) {
      this.mesh.userData.gliderMesh.visible = false;
    }
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
    const prev = this.progress;
    let delta = t - prev;
    if (delta < -0.5) {
      delta += 1.0; // ゴールライン（0境界）をまたいだ場合の前進差分
    }

    // 正当な前進判定（ショートカットワープを除外）
    const isForward = (delta >= 0 && delta < 0.25);
    const isLapCrossing = (prev > 0.70 && t < 0.25) || (this.highestProgressThisLap > 0.70 && t < 0.25);

    if (isForward || isLapCrossing) {
      this.progress = t;
      if (t > this.highestProgressThisLap) {
        this.highestProgressThisLap = t;
      }
    }

    // 周回判定を呼び出し
    this.updateLapProgress(t, prev);
  }

  updateLapProgress(t, prevT = this.progress) {
    if (this.isFinished) return;
    // 1周の後半(>0.7)を通過した状態でスタート/ゴールライン(t < 0.20)を横切った場合
    const crossedFinish = (prevT > 0.70 || this.progress > 0.70 || this.highestProgressThisLap > 0.70) && t < 0.20;
    if (crossedFinish) {
      this.currentLap++;
      this.highestProgressThisLap = t;
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
      const dy = pos.y - (pt.y + 0.35);
      const d = (pos.x - pt.x) ** 2 + dy * dy * 1.5 + (pos.z - pt.z) ** 2;
      if (d < minDist) {
        minDist = d;
        bestT = t;
      }
    }
    // Refine locally so elevation and road contact do not jump between coarse samples.
    let step = 1 / samples;
    for (let pass = 0; pass < 7; pass++) {
      for (const offset of [-step, step]) {
        const t = (bestT + offset + 1) % 1;
        const p = curve.getPointAt(t);
        const dy = pos.y - (p.y + 0.35);
        const d = (pos.x - p.x) ** 2 + dy * dy * 1.5 + (pos.z - p.z) ** 2;
        if (d < minDist) { minDist = d; bestT = t; }
      }
      step /= 2;
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

  spinOut(gameState = null) {
    if (this.isGigaStampede) return;
    if (this.hasShield) {
      this.hasShield = false;
      return; // 攻撃をバリアが身代わりで吸収！
    }
    if (this.perkTrapShieldCount && this.perkTrapShieldCount > 0) {
      this.perkTrapShieldCount--;
      const gs = gameState || this.gameState;
      if (gs && this.isLocalPlayer) {
        gs.showItemNotification('🛡️ トラップシールドが身代わり発動！スピンを無効化！', 2000);
      }
      return;
    }
    if (this.invincibleTimer > 0 || this.isSpinning || this.isRespawning) return;
    this.isSpinning = true;
    this.spinTimer = this.perkIronBumper ? 0.6 : 1.2;
    this.speed = this.speed * (this.perkIronBumper ? 0.45 : 0.2);
  }

  applySmall(duration) {
    if (this.invincibleTimer > 0 || this.isRespawning) return;
    this.isSmall = true;
    this.smallTimer = Math.max(this.smallTimer, duration);
    this.mesh.scale.set(0.55, 0.55, 0.55);
  }

  applyStinkDebuff(duration = 4.0, gameState = null) {
    if (this.invincibleTimer > 0 || this.isRespawning) return;
    this.stinkTimer = Math.max(this.stinkTimer || 0, duration);
    if (!this.stinkEffectMesh) {
      this.createStinkEffect();
    }
    if (this.isLocalPlayer && gameState) {
      gameState.showItemNotification('💩 強烈な異臭パワー！悪臭でスピードダウン！', 2500);
    }
  }

  createStinkEffect() {
    const stinkGroup = new THREE.Group();
    stinkGroup.name = 'stink_aura';
    const stinkMat = new THREE.MeshBasicMaterial({ color: 0x84cc16, transparent: true, opacity: 0.65 });
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.SphereGeometry(0.25, 6, 6);
      const puff = new THREE.Mesh(geo, stinkMat);
      puff.position.set((Math.random() - 0.5) * 0.8, 1.2 + i * 0.35, (Math.random() - 0.5) * 0.8);
      stinkGroup.add(puff);
    }
    this.mesh.add(stinkGroup);
    this.stinkEffectMesh = stinkGroup;
  }
}
