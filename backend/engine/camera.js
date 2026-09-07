// backend/engine/camera.js
// カート追従三人称視点カメラ
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class FollowCamera {
  constructor(camera, targetMesh) {
    this.camera = camera;
    this.target = targetMesh;

    this.distance = 6.5;
    this.height = 3.2;
    this.lookAheadHeight = 1.2;
    this.lerpSpeed = 7.0;

    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
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
    this.currentPosition.copy(this.target.position).addScaledVector(backward, this.distance);
    this.currentPosition.y += this.height;

    this.currentLookAt.copy(this.target.position);
    this.currentLookAt.y += this.lookAheadHeight;

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  update(dt) {
    if (!this.target) return;

    // カートの後方位置を計算
    const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.quaternion);
    const desiredPos = new THREE.Vector3()
      .copy(this.target.position)
      .addScaledVector(backward, this.distance);
    desiredPos.y += this.height;

    // スムーズに追従補間
    this.currentPosition.lerp(desiredPos, Math.min(1.0, dt * this.lerpSpeed));
    this.camera.position.copy(this.currentPosition);

    // 注視点
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.target.quaternion);
    const desiredLookAt = new THREE.Vector3()
      .copy(this.target.position)
      .addScaledVector(forward, 2.0);
    desiredLookAt.y += this.lookAheadHeight;

    this.currentLookAt.lerp(desiredLookAt, Math.min(1.0, dt * (this.lerpSpeed + 2)));
    this.camera.lookAt(this.currentLookAt);
  }
}
