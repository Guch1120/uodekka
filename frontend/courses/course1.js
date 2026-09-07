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

  // サーキットのウェイポイント（CatmullRomスプライン補間用）
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

  // アイテムボックスの配置位置（スプライン上のT値 0.0〜1.0）
  itemBoxLocations: [0.15, 0.45, 0.75],

  createEnvironment(scene) {
    const group = new THREE.Group();

    // 地面（芝生）
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x55aa44, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    group.add(ground);

    // 木・装飾オブジェクトのランダム配置
    const treeTrunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
    const treeLeavesGeo = new THREE.ConeGeometry(3.5, 7, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x795548 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });

    for (let i = 0; i < 70; i++) {
      const angle = (i / 70) * Math.PI * 2;
      const dist = 120 + Math.sin(i * 3) * 60 + (Math.random() * 80);
      const x = Math.cos(angle) * dist + 60;
      const z = Math.sin(angle) * dist + 160;

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(treeTrunkGeo, trunkMat);
      trunk.position.y = 2;
      const leaves = new THREE.Mesh(treeLeavesGeo, leavesMat);
      leaves.position.y = 6;
      tree.add(trunk);
      tree.add(leaves);
      tree.position.set(x, 0, z);
      tree.castShadow = true;
      group.add(tree);
    }

    return group;
  }
};
