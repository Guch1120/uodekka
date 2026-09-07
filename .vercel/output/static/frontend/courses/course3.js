// frontend/courses/course3.js
// コース3: 「コズミック・ネオン」 (宇宙空間に浮かぶ近未来レインボーコース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Course3 = {
  id: 'course3',
  name: 'コズミック・ネオン',
  theme: 'space',
  skyColor: 0x050518,
  ambientColor: 0x88bbff,
  trackWidth: 34,
  totalLaps: 3,

  points: [
    new THREE.Vector3(0, 5, 0),
    new THREE.Vector3(140, 15, -40),
    new THREE.Vector3(260, 25, 40),
    new THREE.Vector3(220, 15, 180),
    new THREE.Vector3(120, 30, 240),
    new THREE.Vector3(0, 20, 260),
    new THREE.Vector3(-120, 10, 200),
    new THREE.Vector3(-180, 25, 80),
    new THREE.Vector3(-120, 15, -20),
    new THREE.Vector3(-30, 5, 0)
  ],

  itemBoxLocations: [0.18, 0.48, 0.78],
  dashPanels: [0.28, 0.62],
  tireWallSegments: [
    { start: 0.04, end: 0.28, side: 'both' }, // 宇宙発進ループ
    // 0.28〜0.42 は切れ目 (宇宙空間への落下・宇宙空間コースアウトゾーン)
    { start: 0.42, end: 0.62, side: 'both' }, // 高架セクション
    // 0.62〜0.76 は切れ目 (急勾配カーブの落下ゾーン)
    { start: 0.76, end: 0.96, side: 'both' }  // 最終ストレート
  ],

  createEnvironment(scene) {
    const group = new THREE.Group();

    // 宇宙の星屑パーティクル
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 1500;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1500;
      positions[i * 3 + 1] = (Math.random() - 0.2) * 800;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1500;

      // ランダムなネオンカラー（シアン、ピンク、イエロー）
      const colorType = Math.random();
      if (colorType < 0.33) {
        colors[i * 3] = 0.2; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1.0;
      } else if (colorType < 0.66) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.2; colors[i * 3 + 2] = 0.8;
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.2;
      }
    }

    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 4,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    const starField = new THREE.Points(starsGeo, starMat);
    group.add(starField);

    // 遠景のネオンリング
    for (let i = 0; i < 6; i++) {
      const ringGeo = new THREE.TorusGeometry(30 + i * 15, 1.5, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x00ffff : 0xff00ff,
        wireframe: true
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(50 + (i - 3) * 60, 40 + i * 5, 120);
      ring.rotation.x = Math.PI / 3;
      group.add(ring);
    }

    return group;
  }
};
