// frontend/vehicles/vehicles.js
// カート機体の定義（Three.jsメッシュ生成、物理走行パラメータ）
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Vehicles = {
  types: {
    standard_red: {
      id: 'standard_red',
      name: 'レッド・ストリーム',
      color: 0xe74c3c,
      accentColor: 0xffffff,
      topSpeed: 42.0,        // 最高速度 (km/h換算 ~126km/h)
      acceleration: 24.0,    // 前進加速度
      brakeForce: 36.0,      // ブレーキ減速力
      inertiaDamping: 1.4,   // アクセルOFF時の慣性滑走・自然減速
      offroadFriction: 0.35, // コース外ダートでの最高速・加速度制限 (35%に大幅低下)
      handling: 1.5,         // ステアリング旋回力
      weight: 1.0,
      driftMultiplier: 1.25
    },
    speed_blue: {
      id: 'speed_blue',
      name: 'ブルー・ファルコン',
      color: 0x3498db,
      accentColor: 0xf1c40f,
      topSpeed: 47.0,
      acceleration: 20.0,
      brakeForce: 32.0,
      inertiaDamping: 1.1,   // 滑りやすい高速慣性
      offroadFriction: 0.30,
      handling: 1.25,
      weight: 1.2,
      driftMultiplier: 1.3
    },
    handling_green: {
      id: 'handling_green',
      name: 'グリーン・ツイスター',
      color: 0x2ecc71,
      accentColor: 0x27ae60,
      topSpeed: 38.0,
      acceleration: 30.0,
      brakeForce: 42.0,
      inertiaDamping: 1.6,
      offroadFriction: 0.40, // ダートでも比較的粘る
      handling: 1.8,
      weight: 0.8,
      driftMultiplier: 1.2
    }
  },

  createKartMesh(vehicleTypeKey = 'standard_red') {
    const config = this.types[vehicleTypeKey] || this.types.standard_red;
    const group = new THREE.Group();

    // 1. シャーシ
    const chassisGeo = new THREE.BoxGeometry(1.6, 0.35, 2.6);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.35;
    chassis.castShadow = true;
    group.add(chassis);

    // 2. メインボディ
    const bodyGeo = new THREE.BoxGeometry(1.2, 0.45, 1.8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.3,
      metalness: 0.6
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.6, 0.1);
    body.castShadow = true;
    group.add(body);

    // ノーズコーン (-Z前方)
    const noseGeo = new THREE.ConeGeometry(0.6, 0.9, 4);
    noseGeo.rotateX(-Math.PI / 2);
    const noseMat = new THREE.MeshStandardMaterial({ color: config.accentColor, roughness: 0.3 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.55, -1.2);
    nose.castShadow = true;
    group.add(nose);

    // 3. ドライバーシート
    const seatGeo = new THREE.BoxGeometry(0.7, 0.5, 0.5);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.7, 0.2);
    group.add(seat);

    // ヘルメット
    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.2 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.25, 0.2);
    head.castShadow = true;
    group.add(head);

    // バイザー (-Z)
    const visorGeo = new THREE.BoxGeometry(0.35, 0.15, 0.2);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.25, 0.05);
    group.add(visor);

    // 4. リアウイング (+Z後方)
    const wingGeo = new THREE.BoxGeometry(1.5, 0.1, 0.4);
    const wingMat = new THREE.MeshStandardMaterial({ color: config.accentColor, roughness: 0.3 });
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, 1.0, 1.2);
    wing.castShadow = true;
    group.add(wing);

    const wingPillarGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    const pillarL = new THREE.Mesh(wingPillarGeo, chassisMat);
    pillarL.position.set(-0.5, 0.7, 1.2);
    const pillarR = pillarL.clone();
    pillarR.position.set(0.5, 0.7, 1.2);
    group.add(pillarL);
    group.add(pillarR);

    // 5. タイヤ（4輪）
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    const wheels = [];
    const wheelPositions = [
      { x: -0.9, y: 0.35, z: -0.8 },
      { x: 0.9, y: 0.35, z: -0.8 },
      { x: -0.95, y: 0.38, z: 0.8 },
      { x: 0.95, y: 0.38, z: 0.8 }
    ];

    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    });

    group.userData = {
      wheels,
      config,
      typeKey: vehicleTypeKey
    };

    return group;
  }
};
