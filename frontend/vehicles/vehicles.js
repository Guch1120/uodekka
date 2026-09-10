// frontend/vehicles/vehicles.js
// カート機体の定義（Three.jsメッシュ生成、物理走行パラメータ）
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export const Vehicles = {
  types: {
    standard_red: {
      id: 'standard_red',
      name: 'レッド・ストリーム',
      image: null, // 画像URLでガレージの3D表示を差し替え
      category: 'バランス型',
      description: '扱いやすさと速さを両立。最初の一台に。',
      color: 0xe74c3c,
      accentColor: 0xffffff,
      topSpeed: 42.0,        // 最高速度 (km/h換算 ~126km/h)
      acceleration: 24.0,    // 前進加速度
      brakeForce: 36.0,      // ブレーキ減速力
      inertiaDamping: 1.4,   // アクセルOFF時の慣性滑走・自然減速
      offroadFriction: 0.35, // コース外ダートでの最高速・加速度制限 (35%に大幅低下)
      handling: 1.5,         // ステアリング旋回力
      weight: 1.0,
      driftMultiplier: 1.25,
      skill: {
        id: 'rocket_charge',
        name: 'ロケット・チャージ',
        icon: '🚀',
        cost: 20,
        cooldown: 14.0,
        duration: 3.0,
        description: '爆発的なロケット推進で一気に最高速超えの超加速！（3秒間）'
      }
    },
    speed_blue: {
      id: 'speed_blue',
      name: 'ブルー・ファルコン',
      image: null, // 画像URLでガレージの3D表示を差し替え
      category: '高速型',
      description: '最高速と重さを武器に、ストレートを駆け抜ける。',
      color: 0x3498db,
      accentColor: 0xf1c40f,
      topSpeed: 47.0,
      acceleration: 20.0,
      brakeForce: 32.0,
      inertiaDamping: 1.1,   // 滑りやすい高速慣性
      offroadFriction: 0.30,
      handling: 1.25,
      weight: 1.2,
      driftMultiplier: 1.3,
      skill: {
        id: 'sky_glider',
        name: 'スカイ・グライダー',
        icon: '🪂',
        cost: 35,
        cooldown: 16.0,
        duration: 5.0,
        description: '地上走行中からどこでもグライダーを即座に展開し空中滑空へ移行！'
      }
    },
    handling_green: {
      id: 'handling_green',
      name: 'グリーン・ツイスター',
      image: null, // 画像URLでガレージの3D表示を差し替え
      category: '軽量型',
      description: '鋭い加速と軽快なハンドリングでコーナーを攻略。',
      color: 0x2ecc71,
      accentColor: 0x27ae60,
      topSpeed: 38.0,
      acceleration: 30.0,
      brakeForce: 42.0,
      inertiaDamping: 1.6,
      offroadFriction: 0.40, // ダートでも比較的粘る
      handling: 1.8,
      weight: 0.8,
      driftMultiplier: 1.2,
      skill: {
        id: 'magnet_barrier',
        name: 'マグネット・バリア',
        icon: '🧲',
        cost: 50,
        cooldown: 18.0,
        duration: 6.0,
        description: '周囲のコインを強力自動吸引＆被弾攻撃を1回完全ガードする電磁シールド！'
      }
    },
    heavy_yellow: {
      id: 'heavy_yellow',
      name: 'イエロー・ビースト',
      image: null,
      category: '重量型',
      description: '重厚なボディと圧倒的パワーでライバルを圧倒するヘビーマシン。',
      color: 0xf39c12,
      accentColor: 0x2c3e50,
      topSpeed: 45.0,
      acceleration: 18.0,
      brakeForce: 30.0,
      inertiaDamping: 1.0,
      offroadFriction: 0.32,
      handling: 1.15,
      weight: 1.5,
      driftMultiplier: 1.35,
      skill: {
        id: 'giga_stampede',
        name: 'ギガ・スタンピード',
        icon: '⚡',
        cost: 65,
        cooldown: 20.0,
        duration: 4.5,
        description: '車体が黄金に輝き巨大化！接触したライバルを弾き飛ばす無敵突進！'
      }
    }
  },

  createKartMesh(vehicleTypeKey = 'standard_red', customColor = null, customAccent = null) {
    const config = this.types[vehicleTypeKey] || this.types.standard_red;
    const mainColor = customColor !== null ? customColor : config.color;
    const accColor = customAccent !== null ? customAccent : config.accentColor;
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
      color: mainColor,
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
    const noseMat = new THREE.MeshStandardMaterial({ color: accColor, roughness: 0.3 });
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
    const headMat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.2 });
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
    const wingMat = new THREE.MeshStandardMaterial({ color: accColor, roughness: 0.3 });
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

    // 6. グライダー（滑空用デルタ翼）
    const gliderMesh = this.createGliderMesh(accColor);
    gliderMesh.position.set(0, 1.65, 0.1);
    gliderMesh.visible = false; // 通常時は格納
    group.add(gliderMesh);

    group.userData = {
      wheels,
      config,
      typeKey: vehicleTypeKey,
      bodyMesh: body,
      headMesh: head,
      wingMesh: wing,
      gliderMesh: gliderMesh,
      defaultColor: mainColor,
      defaultAccent: accColor
    };

    return group;
  },

  createGliderMesh(accentColor = 0x3498db) {
    const gliderGroup = new THREE.Group();

    // デルタ翼（カイト・ハンググライダー型）
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.8);
    wingShape.lineTo(-1.8, 1.1);
    wingShape.lineTo(0, 0.6);
    wingShape.lineTo(1.8, 1.1);
    wingShape.closePath();

    const wingGeo = new THREE.ShapeGeometry(wingShape);
    wingGeo.rotateX(Math.PI / 2);

    const wingMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.3,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    const wingMesh = new THREE.Mesh(wingGeo, wingMat);
    wingMesh.castShadow = true;
    gliderGroup.add(wingMesh);

    // センターストライプ
    const stripeGeo = new THREE.PlaneGeometry(0.22, 1.6);
    stripeGeo.rotateX(Math.PI / 2);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.01, 0.1);
    gliderGroup.add(stripe);

    // カーボンフレーム・支柱
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, -0.35, 0.2);
    gliderGroup.add(pole);

    const stayGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6);
    stayGeo.rotateX(Math.PI / 6);
    const stay = new THREE.Mesh(stayGeo, poleMat);
    stay.position.set(0, -0.35, -0.1);
    gliderGroup.add(stay);

    return gliderGroup;
  }
};

export const SkillsManager = {
  getBankCoins() {
    try {
      const val = localStorage.getItem('kart_coin_bank');
      return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
    } catch {
      return 0;
    }
  },

  addBankCoins(amount) {
    if (!amount || amount <= 0) return this.getBankCoins();
    try {
      const current = this.getBankCoins();
      const next = current + Math.floor(amount);
      localStorage.setItem('kart_coin_bank', next.toString());
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kart-coins-updated', { detail: { coins: next } }));
      }
      return next;
    } catch {
      return this.getBankCoins();
    }
  },

  getUnlockedSkills() {
    try {
      const raw = localStorage.getItem('kart_unlocked_skills');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  isSkillUnlocked(vehicleKey) {
    const unlocked = this.getUnlockedSkills();
    return !!unlocked[vehicleKey];
  },

  canUnlock(vehicleKey) {
    const vehicle = Vehicles.types[vehicleKey];
    if (!vehicle || !vehicle.skill) return false;
    if (this.isSkillUnlocked(vehicleKey)) return false;
    return this.getBankCoins() >= (vehicle.skill.cost || 0);
  },

  unlockSkill(vehicleKey) {
    const vehicle = Vehicles.types[vehicleKey];
    if (!vehicle || !vehicle.skill) return false;
    if (this.isSkillUnlocked(vehicleKey)) return true;
    const cost = vehicle.skill.cost || 0;
    const bank = this.getBankCoins();
    if (bank < cost) return false;

    try {
      const next = bank - cost;
      localStorage.setItem('kart_coin_bank', next.toString());
      const unlocked = this.getUnlockedSkills();
      unlocked[vehicleKey] = true;
      localStorage.setItem('kart_unlocked_skills', JSON.stringify(unlocked));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kart-coins-updated', { detail: { coins: next } }));
      }
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * レース内ローグライク強化スキル（Perks）の定義と抽選ロジック
 */
export const InRacePerks = {
  definitions: {
    top_speed: {
      id: 'top_speed',
      name: 'トップスピード+',
      icon: '🏎️',
      description: '最高速度が 8% 向上します。（重複可能）',
      rarity: 'common',
      apply(kart) {
        kart.perkTopSpeedBoost = (kart.perkTopSpeedBoost || 0) + 0.08;
      }
    },
    rapid_accel: {
      id: 'rapid_accel',
      name: 'クイック加速',
      icon: '⚡',
      description: '加速性能が 20% 向上します。（重複可能）',
      rarity: 'common',
      apply(kart) {
        kart.perkAccelBoost = (kart.perkAccelBoost || 0) + 0.20;
      }
    },
    coin_vacuum: {
      id: 'coin_vacuum',
      name: 'マグネット拡張',
      icon: '🧲',
      description: 'コイン吸引範囲が大幅拡大（+12m）。',
      rarity: 'rare',
      apply(kart) {
        kart.perkMagnetRadius = (kart.perkMagnetRadius || 0) + 12;
      }
    },
    drift_surge: {
      id: 'drift_surge',
      name: 'ドリフトブースト',
      icon: '💨',
      description: 'ミニターボの持続時間が 1.5倍 に延長。',
      rarity: 'rare',
      apply(kart) {
        kart.perkDriftBoost = (kart.perkDriftBoost || 1.0) * 1.5;
      }
    },
    iron_bumper: {
      id: 'iron_bumper',
      name: 'バンパーアーマー',
      icon: '🛡️',
      description: '被弾スピン時間を半減＆壁衝突減速を軽減。',
      rarity: 'rare',
      apply(kart) {
        kart.perkIronBumper = true;
      }
    },
    skill_accelerator: {
      id: 'skill_accelerator',
      name: 'スキル短縮',
      icon: '🚀',
      description: 'マシン固有スキルのクールダウンが 25% 短縮。',
      rarity: 'epic',
      apply(kart) {
        kart.perkCooldownReduction = (kart.perkCooldownReduction || 0) + 0.25;
      }
    },
    trap_guard: {
      id: 'trap_guard',
      name: 'トラップシールド',
      icon: '🍌',
      description: 'バナナやうんちのスピンを1度完全に防ぎます。',
      rarity: 'epic',
      apply(kart) {
        kart.perkTrapShieldCount = (kart.perkTrapShieldCount || 0) + 1;
      }
    },
    lucky_coin: {
      id: 'lucky_coin',
      name: 'ラッキーコイン',
      icon: '🪙',
      description: 'コインを拾うたびにミニダッシュが発生！',
      rarity: 'common',
      apply(kart) {
        kart.perkLuckyCoin = true;
      }
    }
  },

  getRandomPerks(count = 3, excludeIds = []) {
    const all = Object.values(this.definitions);
    const available = all.filter(p => !excludeIds.includes(p.id));
    const pool = available.length >= count ? available : all;
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
};


