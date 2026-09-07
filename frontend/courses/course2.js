// frontend/courses/course2.js
// コース2: 「サンセット・キャニオン」 (起伏・急カーブのある夕焼けの谷コース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Course2 = {
  id: 'course2',
  name: 'サンセット・キャニオン',
  theme: 'desert',
  skyColor: 0xeb7d34,
  ambientColor: 0xffe0b2,
  trackWidth: 30,
  totalLaps: 3,

  // 高低差のあるウェイポイント
  points: [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(90, 8, 40),
    new THREE.Vector3(160, 15, 120),
    new THREE.Vector3(130, 8, 220),
    new THREE.Vector3(40, 2, 260),
    new THREE.Vector3(-60, 10, 290),
    new THREE.Vector3(-140, 16, 210),
    new THREE.Vector3(-120, 10, 100),
    new THREE.Vector3(-70, 4, 30),
    new THREE.Vector3(-15, 0, 0)
  ],

  itemBoxLocations: [0.2, 0.5, 0.8],

  createEnvironment(scene) {
    const group = new THREE.Group();

    // 砂漠の地面
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    group.add(ground);

    // 岩山やサボテン
    const rockGeo = new THREE.DodecahedronGeometry(10, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xa04000, roughness: 0.9 });

    for (let i = 0; i < 45; i++) {
      const angle = (i / 45) * Math.PI * 2;
      const dist = 140 + Math.cos(i * 2) * 50 + (Math.random() * 60);
      const x = Math.cos(angle) * dist + 10;
      const z = Math.sin(angle) * dist + 150;

      const rock = new THREE.Mesh(rockGeo, rockMat);
      const scale = 0.8 + Math.random() * 2.2;
      rock.scale.set(scale, scale * (1 + Math.random() * 1.5), scale);
      rock.position.set(x, scale * 4, z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      group.add(rock);
    }

    return group;
  }
};
