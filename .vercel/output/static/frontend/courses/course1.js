// frontend/courses/course1.js
// コース1: 「ピーチ・サーキット」 (爽快な舗装オーバルサーキット)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Course1 = {
  id: 'course1',
  name: 'ピーチ・サーキット',
  theme: 'grassland',
  skyColor: 0x87ceeb,
  ambientColor: 0xffffff,
  trackWidth: 32,
  totalLaps: 3,

  points: [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(120, 0, 20),
    new THREE.Vector3(220, 0, 100),
    new THREE.Vector3(240, 0, 220),
    new THREE.Vector3(160, 0, 320),
    new THREE.Vector3(30, 0, 300),
    new THREE.Vector3(-80, 0, 260),
    new THREE.Vector3(-140, 0, 160),
    new THREE.Vector3(-100, 0, 50),
    new THREE.Vector3(-20, 0, 0)
  ],

  itemBoxLocations: [0.15, 0.45, 0.75],
  dashPanels: [0.32, 0.68],
  tireWallSegments: [
    { start: 0.04, end: 0.36, side: 'both' }, // 第1コーナー付近は壁で守る
    // 0.36〜0.44 は切れ目 (アウト側へ飛び出すとコースアウト)
    { start: 0.44, end: 0.70, side: 'both' }, // バックストレッチ付近
    // 0.70〜0.78 は切れ目 (急カーブ手前の危険な飛び出しゾーン)
    { start: 0.78, end: 0.96, side: 'both' }  // 最終コーナーとホームストレート
  ],

  createEnvironment(scene) {
    const group = new THREE.Group();
    const obstacles = [];

    // 地面（芝生）
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x55aa44, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    group.add(ground);

    // 木・装飾オブジェクト（幹と葉）
    const treeTrunkGeo = new THREE.CylinderGeometry(0.8, 1.1, 4.5, 8);
    const treeLeavesGeo = new THREE.ConeGeometry(4.0, 8, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.8 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6 });

    // 一時的なコーススプラインで道路上の重複配置を避ける
    const curve = new THREE.CatmullRomCurve3(this.points, true, 'centripetal');

    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * Math.PI * 2;
      const dist = 100 + Math.sin(i * 3) * 60 + (Math.random() * 90);
      const x = Math.cos(angle) * dist + 60;
      const z = Math.sin(angle) * dist + 160;

      // 道路中心線からの距離をチェック（道路上なら外側にずらす）
      const testPos = new THREE.Vector3(x, 0, z);
      let minDist = Infinity;
      for (let s = 0; s < 40; s++) {
        const pt = curve.getPointAt(s / 40);
        const d = testPos.distanceTo(pt);
        if (d < minDist) minDist = d;
      }

      // コース幅（32m / 2 = 16m）のすぐ外側や内側に配置
      if (minDist < 18.0) {
        continue; // 道路に近すぎる場合はスキップして道路外に安全配置
      }

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(treeTrunkGeo, trunkMat);
      trunk.position.y = 2.25;
      const leaves = new THREE.Mesh(treeLeavesGeo, leavesMat);
      leaves.position.y = 6.5;
      tree.add(trunk);
      tree.add(leaves);
      tree.position.set(x, 0, z);
      tree.castShadow = true;
      group.add(tree);

      // 当たり判定用コライダー情報
      obstacles.push({
        position: tree.position,
        radius: 1.6, // 幹の衝突半径
        type: 'tree'
      });
    }

    group.userData = { obstacles };
    return group;
  }
};
