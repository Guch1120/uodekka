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
  }

  setTarget(mesh) {
    this.target = mesh;
    if (mesh) {
      this.resetImmediate();
    }
  }

  resetImmediate() {
    if (!this.target) return;
    const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.quaternion);
    backward.y = 0;
    backward.normalize();

    this.currentPosition.copy(this.target.position).addScaledVector(backward, this.distance);
    this.currentPosition.y += this.height;

    this.currentLookAt.copy(this.target.position);
    this.currentLookAt.y += this.lookAheadHeight;

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    this.savedBackward.copy(backward);
  }

  update(dt, isSpinning = false, courseSpline = null, progressT = 0) {
    if (!this.target) return;

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
        backwardDir.normalize();

        forwardDir.set(0, 0, -1).applyQuaternion(this.target.quaternion);
        forwardDir.y = 0;
        forwardDir.normalize();
      }

      this.savedBackward.copy(backwardDir);
      this.savedForward.copy(forwardDir);
    }

    // カメラ目標位置
    const desiredPos = new THREE.Vector3()
      .copy(this.target.position)
      .addScaledVector(backwardDir, this.distance);
    desiredPos.y += this.height;

    // カメラ位置補間
    this.currentPosition.lerp(desiredPos, Math.min(1.0, dt * this.lerpSpeed));
    this.camera.position.copy(this.currentPosition);

    // カメラ注視点
    const desiredLookAt = new THREE.Vector3()
      .copy(this.target.position)
      .addScaledVector(forwardDir, 2.5);
    desiredLookAt.y += this.lookAheadHeight;

    this.currentLookAt.lerp(desiredLookAt, Math.min(1.0, dt * (this.lerpSpeed + 2)));
    this.camera.lookAt(this.currentLookAt);
  }
}
