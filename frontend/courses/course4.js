// frontend/courses/course4.js
// コース4: 「スカイハイ・サーキット」 (大空と浮遊島を巡るジャンプ台＆グライダー滑空コース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Course4 = {
  id: 'course4',
  previewImage: null,
  name: 'スカイハイ・サーキット',
  theme: 'sky',
  skyColor: 0x4aa3df,
  ambientColor: 0xffffff,
  trackWidth: 32,
  totalLaps: 3,

  points: [
    new THREE.Vector3(0, 0, 0),             // スタートライン
    new THREE.Vector3(80, 2, -40),
    new THREE.Vector3(180, 8, -60),
    new THREE.Vector3(260, 16, -20),         // 谷の手前
    new THREE.Vector3(340, 20, 60),          // 通常ジャンプ台 (t=0.35付近) で谷越え
    new THREE.Vector3(380, 22, 160),
    new THREE.Vector3(340, 26, 260),
    new THREE.Vector3(220, 32, 320),         // 浮遊天空プラトー最高地点 (+32m)
    new THREE.Vector3(100, 35, 330),         // 崖っぷち・滑空ジャンプ台 (t=0.70付近)
    new THREE.Vector3(-60, 20, 300),         // 空中滑空ゾーン（雲の上を飛行）
    new THREE.Vector3(-180, 8, 200),        // 滑空着地エリア
    new THREE.Vector3(-200, 2, 80),
    new THREE.Vector3(-140, 0, -10),
    new THREE.Vector3(-50, 0, 0)
  ],

  itemBoxLocations: [0.18, 0.52, 0.85],
  // 加速板とジャンプ台は基本セット
  dashPanels: [0.32, 0.67],
  jumpRamps: [
    { t: 0.34, type: 'standard', boost: true, widthScale: 0.65, height: 2.0 },
    { t: 0.69, type: 'glider', boost: true, widthScale: 0.75, height: 2.6 }
  ],
  tireWallSegments: [
    { start: 0.04, end: 0.30, side: 'both' },
    // 0.30〜0.38 はジャンプ台と谷越えオープンエリア
    { start: 0.40, end: 0.65, side: 'both' },
    // 0.65〜0.78 は滑空大ジャンプ台と空中フライトエリア
    { start: 0.80, end: 0.96, side: 'both' }
  ],

  createEnvironment(scene) {
    const group = new THREE.Group();
    const obstacles = [];

    // 下界の雲海（広大な半透明プレーン）
    const cloudGeo = new THREE.PlaneGeometry(1600, 1600, 16, 16);
    cloudGeo.rotateX(-Math.PI / 2);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xebf3f9,
      roughness: 0.6,
      transparent: true,
      opacity: 0.85
    });
    const cloudSea = new THREE.Mesh(cloudGeo, cloudMat);
    cloudSea.position.y = -12;
    group.add(cloudSea);

    // 浮遊山岳・天空の岩山（ローポリマウンテン）
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.85 });
    const greenCapMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 });

    const mountainPositions = [
      { x: 260, y: -10, z: 120, r: 45, h: 60 },
      { x: 380, y: -5, z: 280, r: 55, h: 75 },
      { x: -120, y: -8, z: 250, r: 60, h: 65 },
      { x: -80, y: -12, z: 60, r: 50, h: 50 },
      { x: 120, y: -15, z: -160, r: 70, h: 80 }
    ];

    mountainPositions.forEach(m => {
      const coneGeo = new THREE.ConeGeometry(m.r, m.h, 7);
      const rock = new THREE.Mesh(coneGeo, rockMat);
      rock.position.set(m.x, m.y + m.h / 2, m.z);
      group.add(rock);

      const capGeo = new THREE.ConeGeometry(m.r * 0.45, m.h * 0.35, 7);
      const cap = new THREE.Mesh(capGeo, greenCapMat);
      cap.position.set(m.x, m.y + m.h * 0.82, m.z);
      group.add(cap);
    });

    // ぷかぷか浮かぶ雲のモデリング（球体の集合）
    const cloudBallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    for (let c = 0; c < 24; c++) {
      const cloudGroup = new THREE.Group();
      const numBalls = 4 + Math.floor(Math.random() * 4);
      for (let b = 0; b < numBalls; b++) {
        const rad = 6 + Math.random() * 8;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(rad, 8, 8), cloudBallMat);
        ball.position.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 16);
        cloudGroup.add(ball);
      }
      const cx = (Math.random() - 0.5) * 900;
      const cy = 10 + Math.random() * 30;
      const cz = (Math.random() - 0.5) * 900;
      cloudGroup.position.set(cx, cy, cz);
      group.add(cloudGroup);
    }

    group.userData = { obstacles };
    return group;
  }
};
