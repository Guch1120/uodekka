// frontend/courses/course2.js
// コース2: 「サンセット・キャニオン」 (起伏・急カーブ・岩山のある夕焼けの谷コース)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Course2 = {
  id: 'course2',
  previewImage: null, // 未指定時は実際の形状から俯瞰図を生成
  name: 'サンセット・キャニオン',
  theme: 'desert',
  skyColor: 0xeb7d34,
  ambientColor: 0xffe0b2,
  trackWidth: 30,
  totalLaps: 3,

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
  dashPanels: [0.35, 0.72],
  jumpRamps: [
    { t: 0.37, type: 'standard', boost: true, widthScale: 0.65, height: 2.0 },
    { t: 0.74, type: 'glider', boost: true, widthScale: 0.75, height: 2.5 }
  ],
  tireWallSegments: [
    { start: 0.05, end: 0.30, side: 'both' }, // 登り勾配区間
    // 0.30〜0.40 は切れ目 (崖っぷち・キャニオン落下の危険ゾーン)
    { start: 0.40, end: 0.65, side: 'both' }, // 中盤
    // 0.65〜0.75 は切れ目 (急カーブ下りの難所コースアウトゾーン)
    { start: 0.75, end: 0.95, side: 'both' }  // 終盤ストレート
  ],

  createEnvironment(scene) {
    const group = new THREE.Group();
    const obstacles = [];

    // 砂漠の地面
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    group.add(ground);

    // 岩山やサボテン
    const rockGeo = new THREE.DodecahedronGeometry(8, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xa04000, roughness: 0.9 });
    const curve = new THREE.CatmullRomCurve3(this.points, true, 'centripetal');

    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2;
      const dist = 120 + Math.cos(i * 2) * 50 + (Math.random() * 60);
      const x = Math.cos(angle) * dist + 10;
      const z = Math.sin(angle) * dist + 150;

      const testPos = new THREE.Vector3(x, 0, z);
      let minDist = Infinity;
      for (let s = 0; s < 40; s++) {
        const pt = curve.getPointAt(s / 40);
        const d = testPos.distanceTo(pt);
        if (d < minDist) minDist = d;
      }

      if (minDist < 17.0) continue;

      const rock = new THREE.Mesh(rockGeo, rockMat);
      const scale = 0.8 + Math.random() * 2.0;
      rock.scale.set(scale, scale * (1 + Math.random() * 1.5), scale);
      rock.position.set(x, scale * 3.5, z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      group.add(rock);

      obstacles.push({
        position: rock.position,
        radius: 2.2 * scale,
        type: 'rock'
      });
    }

    group.userData = { obstacles };
    return group;
  }
};
