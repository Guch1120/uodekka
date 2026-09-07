// frontend/vehicles/vehicles.js
// カート機体の定義（Three.jsメッシュ生成、性能パラメータ、カラー設定など）
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Vehicles = {
  types: {
    standard_red: {
      id: 'standard_red',
      name: 'レッド・ストリーム',
      color: 0xe74c3c,
      accentColor: 0xffffff,
      topSpeed: 42,
      acceleration: 24,
      handling: 1.6,         // 旋回感度を適度にマイルド化 (旧: 2.8)
      weight: 1.0,
      driftMultiplier: 1.3
    },
    speed_blue: {
      id: 'speed_blue',
      name: 'ブルー・ファルコン',
      color: 0x3498db,
      accentColor: 0xf1c40f,
      topSpeed: 48,
      acceleration: 20,
      handling: 1.3,         // 旋回感度を適度にマイルド化 (旧: 2.2)
      weight: 1.2,
      driftMultiplier: 1.35
    },
    handling_green: {
      id: 'handling_green',
      name: 'グリーン・ツイスター',
      color: 0x2ecc71,
      accentColor: 0x27ae60,
      topSpeed: 38,
      acceleration: 30,
      handling: 1.9,         // 旋回感度を適度にマイルド化 (旧: 3.4)
      weight: 0.8,
      driftMultiplier: 1.25
    }
  },

  /**
   * カートの3Dモデル（Three.js Group）
   * 前方を -Z 方向、後方を +Z 方向として整列
   */
  createKartMesh(vehicleTypeKey = 'standard_red') {
    const config = this.types[vehicleTypeKey] || this.types.standard_red;
    const group = new THREE.Group();

    // 1. シャーシ（車体下部）
    const chassisGeo = new THREE.BoxGeometry(1.6, 0.35, 2.6);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.35;
    chassis.castShadow = true;
    group.add(chassis);

    // 2. ボディ（メインカウル）
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

    // ノーズコーン (前方: -Z 方向を尖らせる)
    const noseGeo = new THREE.ConeGeometry(0.6, 0.9, 4);
    noseGeo.rotateX(-Math.PI / 2); // 先端を -Z に向ける
    const noseMat = new THREE.MeshStandardMaterial({ color: config.accentColor, roughness: 0.3 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.55, -1.2);
    nose.castShadow = true;
    group.add(nose);

    // 3. コックピット & ドライバー（ヘルメット）
    const seatGeo = new THREE.BoxGeometry(0.7, 0.5, 0.5);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.7, 0.2);
    group.add(seat);

    // ヘルメット（ドライバーの頭部）
    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.2 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.25, 0.2);
    head.castShadow = true;
    group.add(head);

    // バイザー (前方を向く: -Z)
    const visorGeo = new THREE.BoxGeometry(0.35, 0.15, 0.2);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.25, 0.05);
    group.add(visor);

    // 4. リアウイング (後方: +Z)
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
      { x: -0.9, y: 0.35, z: -0.8 },  // 前左 (Z = -0.8)
      { x: 0.9, y: 0.35, z: -0.8 },   // 前右 (Z = -0.8)
      { x: -0.95, y: 0.38, z: 0.8 },  // 後左 (Z = +0.8)
      { x: 0.95, y: 0.38, z: 0.8 }   // 後右 (Z = +0.8)
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
