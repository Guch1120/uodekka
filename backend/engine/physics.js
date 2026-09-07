// backend/engine/physics.js
// カートの走行力学（加速・減速・ドリフト・ステアリング・コース判定・ミニターボ・スピン）
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class KartPhysics {
  constructor(mesh, config = {}, isLocal = false) {
    this.mesh = mesh;
    this.isLocalPlayer = isLocal;
    this.id = Math.random().toString(36).substring(2, 9);

    // 性能パラメータ
    this.maxSpeed = config.topSpeed || 42.0;
    this.acceleration = config.acceleration || 24.0;
    this.handling = config.handling || 2.8;
    this.driftMultiplier = config.driftMultiplier || 1.4;

    // 状態変数
    this.speed = 0;
    this.steerAngle = 0;
    this.driftTime = 0;
    this.isDrifting = false;
    this.driftDirection = 0; // -1 (左), 1 (右)
    this.isSpinning = false;
    this.spinTimer = 0;

    this.boostTimer = 0;
    this.boostMultiplier = 1.0;
    this.invincibleTimer = 0;

    // レース進行状態
    this.currentLap = 1;
    this.totalLaps = 3;
    this.progress = 0; // スプライン上の進捗 0.0〜1.0
    this.lapCompletedDistance = 0;
    this.isFinished = false;
    this.finishTime = 0;

    this.holdingItem = null;
    this.position = this.mesh.position;
    this.rotation = this.mesh.quaternion;
  }

  update(dt, inputState, courseSpline, trackWidth = 16) {
    if (this.isSpinning) {
      this.spinTimer -= dt;
      this.mesh.rotation.y += dt * 18.0;
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 4.0);
      if (this.spinTimer <= 0) {
        this.isSpinning = false;
      }
      return;
    }

    // ブースト効果の減衰
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.boostMultiplier = 1.0;
      }
    }

    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
    }

    // 1. 加速と減速 (アクセル & ブレーキ & 摩擦)
    const accelInput = inputState.accelerating;
    const brakeInput = inputState.braking;

    const currentMaxSpeed = this.maxSpeed * this.boostMultiplier;

    if (accelInput > 0) {
      this.speed += this.acceleration * accelInput * dt;
    } else if (brakeInput > 0) {
      this.speed -= this.acceleration * 1.4 * brakeInput * dt;
    } else {
      // 自然減速 (空気抵抗・摩擦)
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 1.5);
    }

    // 後退速度リミットと前進リミット
    this.speed = Math.max(-12, Math.min(currentMaxSpeed, this.speed));

    // 2. コース外判定（オフロード減速）
    if (courseSpline) {
      const nearestT = this.findNearestTrackT(courseSpline, this.mesh.position);
      const trackCenter = courseSpline.getPointAt(nearestT);
      const distFromCenter = new THREE.Vector2(this.mesh.position.x - trackCenter.x, this.mesh.position.z - trackCenter.z).length();

      if (distFromCenter > (trackWidth / 2) + 1.0 && this.invincibleTimer <= 0) {
        // コース外ダート減速
        this.speed = Math.min(this.speed, this.maxSpeed * 0.4);
      }
    }

    // 3. ドリフト制御
    if (inputState.drift && Math.abs(inputState.steering) > 0.2 && Math.abs(this.speed) > 12) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftDirection = Math.sign(inputState.steering);
        this.driftTime = 0;
      }
      this.driftTime += dt;
    } else {
      if (this.isDrifting) {
        // ドリフト終了時にミニターボ発動判定
        if (this.driftTime > 1.8) {
          this.applyBoost(1.45, 1.8); // スーパーミニターボ
        } else if (this.driftTime > 0.8) {
          this.applyBoost(1.25, 1.0); // ミニターボ
        }
        this.isDrifting = false;
      }
    }

    // 4. ステアリング旋回
    let steerRate = this.handling;
    if (this.isDrifting) {
      steerRate *= this.driftMultiplier;
    }

    // 車速が出ているときのみ曲がる
    const speedFactor = Math.min(1.0, Math.abs(this.speed) / 10.0);
    const steerDelta = -inputState.steering * steerRate * speedFactor * dt;

    this.mesh.rotation.y += steerDelta;

    // 前輪の向きアニメーション
    if (this.mesh.userData && this.mesh.userData.wheels) {
      const wheels = this.mesh.userData.wheels;
      if (wheels[0] && wheels[1]) {
        wheels[0].rotation.y = -inputState.steering * 0.4;
        wheels[1].rotation.y = -inputState.steering * 0.4;
      }
    }

    // 5. 前進ベクトル更新
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    this.mesh.position.addScaledVector(forward, this.speed * dt);

    // コース面の高さを追従
    if (courseSpline) {
      const nearestT = this.findNearestTrackT(courseSpline, this.mesh.position);
      const trackPoint = courseSpline.getPointAt(nearestT);
      this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, trackPoint.y + 0.35, dt * 10);

      // 進捗・ラップ計算
      this.updateLapProgress(nearestT);
    }
  }

  updateLapProgress(t) {
    if (this.isFinished) return;

    // t値が0.9付近から0.1付近へ跨いだときラップ加算
    if (this.progress > 0.85 && t < 0.15) {
      this.currentLap++;
      if (this.currentLap > this.totalLaps) {
        this.isFinished = true;
        this.finishTime = performance.now();
      }
    }
    this.progress = t;
  }

  findNearestTrackT(curve, pos) {
    // 粗い探索のち微細探索
    let bestT = 0;
    let minDist = Infinity;
    const samples = 60;
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
    if (this.invincibleTimer > 0 || this.isSpinning) return;
    this.isSpinning = true;
    this.spinTimer = 1.2;
    this.speed = this.speed * 0.2;
  }
}
