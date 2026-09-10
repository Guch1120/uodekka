// backend/engine/camera.js
// カート追従三人称視点カメラ (スピン中は追従せず、終了後に進行方向をスムーズに向く)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class FollowCamera {
  constructor(camera, targetMesh) {
    this.camera = camera;
    this.target = targetMesh;

    this.distance = 7.5;
    this.height = 3.6;
    this.lookAheadHeight = 1.3;
    this.lerpSpeed = 6.0;

    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    // スピン中酔い防止: カメラの固定方位角
    this.savedBackward = new THREE.Vector3(0, 0, 1);
    this.savedForward = new THREE.Vector3(0, 0, -1);
    this.wasSpinning = false;

    // 診断用
    this.lastPosition = new THREE.Vector3();
    this.frozenFrameCount = 0;
    this.isFrozen = false;
  }

  setTarget(mesh) {
    this.target = mesh;
    if (mesh) {
      this.resetImmediate();
    }
  }

  resetImmediate() {
    if (!this.target) return;
    const tPos = this.target.position;
    if (!this.isValidVector3(tPos)) return;

    const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.quaternion);
    backward.y = 0;
    if (backward.lengthSq() > 0.0001) backward.normalize();
    else backward.set(0, 0, 1);

    this.currentPosition.copy(tPos).addScaledVector(backward, this.distance);
    this.currentPosition.y += this.height;

    this.currentLookAt.copy(tPos);
    this.currentLookAt.y += this.lookAheadHeight;

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    this.savedBackward.copy(backward);
    this.lastPosition.copy(this.currentPosition);
    this.frozenFrameCount = 0;
    this.isFrozen = false;
  }

  isValidNumber(n) {
    return typeof n === 'number' && !isNaN(n) && isFinite(n);
  }

  isValidVector3(v) {
    return v && this.isValidNumber(v.x) && this.isValidNumber(v.y) && this.isValidNumber(v.z);
  }

  update(dt, isSpinning = false, courseSpline = null, progressT = 0, kartSpeed = 0) {
    if (!this.target) return;

    const targetPos = this.target.position;
    if (!this.isValidVector3(targetPos)) {
      console.warn('[FollowCamera] Target position contains NaN/Infinity, skipping camera update');
      return;
    }

    let backwardDir = new THREE.Vector3();
    let forwardDir = new THREE.Vector3();

    if (isSpinning) {
      // スピン中はカートの激しい自転に追従せず、スピン開始前のカメラ向きを保持
      backwardDir.copy(this.savedBackward);
      forwardDir.copy(this.savedForward);
      this.wasSpinning = true;
    } else {
      if (this.wasSpinning && courseSpline) {
        // スピン終了直後: コースの正規進行方向（スプライン接線）を基準にしてスムーズに後ろへ回り込む
        const tangent = courseSpline.getTangentAt(progressT).normalize();
        forwardDir.copy(tangent);
        backwardDir.copy(tangent).negate();
        this.wasSpinning = false;
      } else {
        // 通常時: カートの向いている方向
        backwardDir.set(0, 0, 1).applyQuaternion(this.target.quaternion);
        backwardDir.y = 0;
        if (backwardDir.lengthSq() > 0.0001) backwardDir.normalize();
        else backwardDir.set(0, 0, 1);

        forwardDir.set(0, 0, -1).applyQuaternion(this.target.quaternion);
        forwardDir.y = 0;
        if (forwardDir.lengthSq() > 0.0001) forwardDir.normalize();
        else forwardDir.set(0, 0, -1);
      }

      this.savedBackward.copy(backwardDir);
      this.savedForward.copy(forwardDir);
    }

    // カメラ目標位置
    const desiredPos = new THREE.Vector3()
      .copy(targetPos)
      .addScaledVector(backwardDir, this.distance);
    desiredPos.y += this.height;

    // NaNチェック
    if (!this.isValidVector3(desiredPos)) {
      console.warn('[FollowCamera] Desired position invalid, resetting');
      this.resetImmediate();
      return;
    }

    // カメラ位置補間
    this.currentPosition.lerp(desiredPos, Math.min(1.0, dt * this.lerpSpeed));
    if (!this.isValidVector3(this.currentPosition)) {
      this.currentPosition.copy(desiredPos);
    }
    this.camera.position.copy(this.currentPosition);

    // カメラ注視点
    const desiredLookAt = new THREE.Vector3()
      .copy(targetPos)
      .addScaledVector(forwardDir, 2.5);
    desiredLookAt.y += this.lookAheadHeight;

    if (this.isValidVector3(desiredLookAt)) {
      this.currentLookAt.lerp(desiredLookAt, Math.min(1.0, dt * (this.lerpSpeed + 2)));
      if (!this.isValidVector3(this.currentLookAt)) {
        this.currentLookAt.copy(desiredLookAt);
      }
      this.camera.lookAt(this.currentLookAt);
    }

    // カメラ停止（フリーズ）検知: カートが動いているのにカメラが動いていない
    if (Math.abs(kartSpeed) > 1.0) {
      const movedDist = this.lastPosition.distanceTo(this.currentPosition);
      if (movedDist < 0.01) {
        this.frozenFrameCount++;
        if (this.frozenFrameCount > 60) {
          this.isFrozen = true;
        }
      } else {
        this.frozenFrameCount = 0;
        this.isFrozen = false;
      }
    } else {
      this.frozenFrameCount = 0;
      this.isFrozen = false;
    }
    this.lastPosition.copy(this.currentPosition);
  }

  getDiagnostics() {
    const hasTarget = !!this.target;
    const targetPos = this.target?.position;
    const camPos = this.camera?.position;
    const lookAt = this.currentLookAt;
    const dist = (targetPos && camPos && this.isValidVector3(targetPos) && this.isValidVector3(camPos))
      ? targetPos.distanceTo(camPos)
      : null;
    return {
      hasTarget,
      position: camPos ? { x: Number(camPos.x.toFixed(2)), y: Number(camPos.y.toFixed(2)), z: Number(camPos.z.toFixed(2)) } : null,
      lookAt: lookAt ? { x: Number(lookAt.x.toFixed(2)), y: Number(lookAt.y.toFixed(2)), z: Number(lookAt.z.toFixed(2)) } : null,
      distanceToTarget: dist !== null ? Number(dist.toFixed(2)) : null,
      hasNaN: !this.isValidVector3(camPos) || !this.isValidVector3(lookAt),
      isFrozen: this.isFrozen,
      frozenFrameCount: this.frozenFrameCount,
      fov: this.camera?.fov,
      aspect: this.camera?.aspect
    };
  }
}
