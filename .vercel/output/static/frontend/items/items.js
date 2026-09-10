// frontend/items/items.js
// マリオカート風アイテム定義・挙動（赤・緑・青甲羅、ボム兵、スター、バナナ/三連、キノコ/三連、サンダー、相殺・落下拾得、ボム爆発エフェクト）
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { Icons } from '../icons/icons.js';

export const Items = {
  lightningHeld: false,

  definitions: {
    mushroom: {
      id: 'mushroom',
      name: 'ダッシュキノコ',
      icon: 'mushroom',
      count: 1,
      canHoldBehind: false,
      use(kart, gameState) {
        kart.applyBoost(1.65, 2.5);
        if (kart.isLocalPlayer) gameState.showItemNotification('ダッシュキノコ発動！加速！');
      }
    },
    triple_mushroom: {
      id: 'triple_mushroom',
      name: 'トリプルキノコ',
      icon: 'triple_mushroom',
      count: 3,
      canHoldBehind: false,
      use(kart, gameState) {
        kart.applyBoost(1.65, 2.5);
        if (kart.isLocalPlayer) gameState.showItemNotification('トリプルキノコ！加速！');
      }
    },
    green_shell: {
      id: 'green_shell',
      name: 'ミドリカメ',
      icon: 'green_shell',
      count: 1,
      canHoldBehind: true,
      use(kart, gameState) {
        const shell = Items.spawnShell(kart, 'green', gameState);
        gameState.activeWorldItems.push(shell);
      }
    },
    red_shell: {
      id: 'red_shell',
      name: 'アカカメ',
      icon: 'red_shell',
      count: 1,
      canHoldBehind: true,
      use(kart, gameState) {
        const shell = Items.spawnShell(kart, 'red', gameState);
        gameState.activeWorldItems.push(shell);
      }
    },
    blue_shell: {
      id: 'blue_shell',
      name: 'トゲゾーこうら (青)',
      icon: 'blue_shell',
      count: 1,
      canHoldBehind: false,
      use(kart, gameState) {
        const shell = Items.spawnBlueShell(kart, gameState);
        gameState.activeWorldItems.push(shell);
        if (kart.isLocalPlayer) gameState.showItemNotification('トゲゾーこうら発射！1位へ急行！');
      }
    },
    banana: {
      id: 'banana',
      name: 'バナナ',
      icon: 'banana',
      count: 1,
      canHoldBehind: true,
      use(kart, gameState, throwDirection = 'backward') {
        const banana = Items.spawnBanana(kart, gameState, throwDirection);
        gameState.activeWorldItems.push(banana);
      }
    },
    triple_banana: {
      id: 'triple_banana',
      name: 'トリプルバナナ',
      icon: 'triple_banana',
      count: 3,
      canHoldBehind: true,
      use(kart, gameState, throwDirection = 'backward') {
        const banana = Items.spawnBanana(kart, gameState, throwDirection);
        gameState.activeWorldItems.push(banana);
      }
    },
    bobomb: {
      id: 'bobomb',
      name: 'ボムへい',
      icon: 'bobomb',
      count: 1,
      canHoldBehind: true,
      use(kart, gameState, throwDirection = 'backward') {
        const bomb = Items.spawnBobomb(kart, gameState, throwDirection);
        gameState.activeWorldItems.push(bomb);
      }
    },
    poop: {
      id: 'poop',
      name: 'うんち',
      icon: 'poop',
      count: 1,
      canHoldBehind: true,
      use(kart, gameState, throwDirection = 'backward') {
        const poop = Items.spawnPoop(kart, gameState, throwDirection);
        gameState.activeWorldItems.push(poop);
      }
    },
    star: {
      id: 'star',
      name: 'スーパースター',
      icon: 'star',
      count: 1,
      canHoldBehind: false,
      use(kart, gameState) {
        kart.applyInvincible(8.0);
        if (kart.isLocalPlayer) gameState.showItemNotification('スーパースター！無敵＆最高速！');
      }
    },
    lightning: {
      id: 'lightning',
      name: 'サンダー',
      icon: 'lightning',
      count: 1,
      canHoldBehind: false,
      use(kart, gameState) {
        Items.triggerLightning(kart, gameState);
        Items.lightningHeld = false;
      }
    }
  },

  getRandomItem(position = 1, totalPlayers = 12) {
    let pool = [];
    const ratio = (position - 1) / Math.max(1, totalPlayers - 1); // 0.0 (1st) to 1.0 (12th)

    if (position === 1) {
      pool = [
        'banana', 'banana', 'poop', 'poop',
        'triple_banana', 'triple_banana',
        'green_shell', 'green_shell',
        'bobomb'
      ];
    } else if (ratio < 0.28) {
      // 上位 (2〜3位)
      pool = [
        'red_shell', 'red_shell',
        'green_shell', 'green_shell',
        'poop', 'triple_banana', 'banana',
        'mushroom', 'bobomb'
      ];
    } else if (ratio < 0.58) {
      // 中位 (4〜7位)
      pool = [
        'red_shell', 'red_shell',
        'triple_mushroom', 'triple_mushroom',
        'mushroom',
        'poop',
        'bobomb',
        'star'
      ];
      if (!this.lightningHeld && Math.random() < 0.2) pool.push('blue_shell');
    } else if (ratio < 0.85) {
      // 下位 (8〜10位): 攻撃・先制系30%, 加速系55%, 逆転系15% (計20枠)
      pool = [
        // 攻撃・先制系 (6枠 = 30%)
        'red_shell', 'red_shell', 'red_shell',
        'green_shell',
        'bobomb',
        'triple_banana',
        // 加速系 (11枠 = 55%)
        'triple_mushroom', 'triple_mushroom', 'triple_mushroom', 'triple_mushroom', 'triple_mushroom',
        'star', 'star', 'star',
        'mushroom', 'mushroom', 'mushroom',
        // 逆転系 (3枠 = 15%)
        'blue_shell', 'blue_shell',
        (!this.lightningHeld ? 'lightning' : 'blue_shell')
      ];
    } else {
      // 最下位層 (11〜12位): 攻撃・先制系30%, 加速系55%, 逆転系15% (計20枠)
      pool = [
        // 攻撃・先制系 (6枠 = 30%)
        'red_shell', 'red_shell', 'red_shell',
        'green_shell',
        'bobomb',
        'triple_banana',
        // 加速系 (11枠 = 55%)
        'star', 'star', 'star', 'star',
        'triple_mushroom', 'triple_mushroom', 'triple_mushroom', 'triple_mushroom', 'triple_mushroom',
        'mushroom', 'mushroom',
        // 逆転系 (3枠 = 15%)
        'blue_shell', 'blue_shell',
        (!this.lightningHeld ? 'lightning' : 'blue_shell')
      ];
    }

    const pickedId = pool[Math.floor(Math.random() * pool.length)];
    const def = this.definitions[pickedId];

    if (pickedId === 'lightning') {
      this.lightningHeld = true;
    }

    return {
      ...def,
      remainingUses: def.count || 1
    };
  },

  createItemBoxMesh() {
    const group = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xf39c12,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2,
      metalness: 0.3
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    group.add(box);

    const innerGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    const innerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, wireframe: true });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    group.add(inner);

    return group;
  },

  createTrailingItemMesh(itemType) {
    const group = new THREE.Group();
    if (itemType === 'banana' || itemType === 'triple_banana') {
      const coneGeo = new THREE.ConeGeometry(0.4, 0.8, 6);
      const coneMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.3 });
      const mesh = new THREE.Mesh(coneGeo, coneMat);
      mesh.rotation.x = Math.PI;
      group.add(mesh);
    } else if (itemType === 'green_shell' || itemType === 'red_shell') {
      const shellGeo = new THREE.SphereGeometry(0.5, 14, 10);
      shellGeo.scale(1, 0.7, 1.1);
      const shellMat = new THREE.MeshStandardMaterial({
        color: itemType === 'green_shell' ? 0x2ecc71 : 0xe74c3c,
        roughness: 0.3
      });
      group.add(new THREE.Mesh(shellGeo, shellMat));
    } else if (itemType === 'bobomb') {
      const bombGeo = new THREE.SphereGeometry(0.5, 14, 10);
      const bombMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
      group.add(new THREE.Mesh(bombGeo, bombMat));
    } else if (itemType === 'poop') {
      const poopMesh = Items.createPoopMesh();
      poopMesh.scale.set(0.65, 0.65, 0.65);
      group.add(poopMesh);
    }
    return group;
  },

  spawnBanana(kart, gameState, throwDirection = 'backward') {
    const group = new THREE.Group();
    const meshGeo = new THREE.ConeGeometry(0.5, 0.9, 6);
    const meshMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.3 });
    const mesh = new THREE.Mesh(meshGeo, meshMat);
    mesh.rotation.x = Math.PI;
    group.add(mesh);

    let velocity = new THREE.Vector3();
    let vy = 0;
    let isAirborne = false;

    if (throwDirection === 'forward') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.rotation);
      group.position.copy(kart.position).addScaledVector(forward, 2.5);
      group.position.y = kart.position.y + 1.2;
      const kartSpeed = (kart.speed || 0);
      velocity = forward.clone().multiplyScalar(Math.max(25, kartSpeed + 22));
      vy = 12.0; // 上向き初速（放物線）
      isAirborne = true;
    } else {
      const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.rotation);
      group.position.copy(kart.position).addScaledVector(backward, 3.2);
      group.position.y = kart.position.y + 0.4;
    }

    gameState.scene.add(group);

    return {
      type: 'banana',
      mesh: group,
      ownerId: kart.id,
      radius: 1.2,
      active: true,
      canBlockShell: true,
      update(dt) {
        if (isAirborne) {
          vy -= 26.0 * dt; // 重力加速度
          group.position.addScaledVector(velocity, dt);
          group.position.y += vy * dt;
          group.rotation.x += dt * 8.0;

          const groundY = gameState.getTrackHeightAt(group.position);
          if (group.position.y <= groundY + 0.4) {
            group.position.y = groundY + 0.4;
            isAirborne = false;
            velocity.set(0, 0, 0);
            group.rotation.set(0, 0, 0);
            mesh.rotation.set(Math.PI, 0, 0);
          }
        } else {
          group.rotation.y += dt * 2.0;
        }
      },
      destroy() {
        if (!this.active) return;
        this.active = false;
        gameState.scene.remove(group);
      },
      onHit(targetKart) {
        if (!this.active) return;
        this.destroy();
        targetKart.spinOut();
        if (this.ownerId === gameState.localPlayerKart?.id && targetKart !== gameState.localPlayerKart) {
          gameState.showItemNotification('仕掛けたバナナに敵がスリップ！🍌', 2500);
        }
      }
    };
  },

  createPoopMesh() {
    const group = new THREE.Group();
    const poopMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.75,
      metalness: 0.05
    });

    // 1段目（下段ベース）
    const tier1Geo = new THREE.CylinderGeometry(0.55, 0.68, 0.32, 12);
    const tier1 = new THREE.Mesh(tier1Geo, poopMat);
    tier1.position.y = 0.16;
    tier1.castShadow = true;
    group.add(tier1);

    // 2段目（中段）
    const tier2Geo = new THREE.CylinderGeometry(0.38, 0.48, 0.28, 12);
    const tier2 = new THREE.Mesh(tier2Geo, poopMat);
    tier2.position.y = 0.42;
    tier2.castShadow = true;
    group.add(tier2);

    // 3段目（最上段コーン＆とんがり）
    const tier3Geo = new THREE.ConeGeometry(0.32, 0.38, 10);
    const tier3 = new THREE.Mesh(tier3Geo, poopMat);
    tier3.position.y = 0.72;
    tier3.castShadow = true;
    group.add(tier3);

    // コミカルな目玉
    const eyeWhiteGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupilGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x18181b });

    const leftEye = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEye.position.set(-0.16, 0.44, 0.44);
    const leftPupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
    leftPupil.position.set(-0.16, 0.44, 0.51);
    group.add(leftEye, leftPupil);

    const rightEye = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEye.position.set(0.16, 0.44, 0.44);
    const rightPupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
    rightPupil.position.set(0.16, 0.44, 0.51);
    group.add(rightEye, rightPupil);

    // 異臭の湯気エフェクト（緑の浮遊パーティクル）
    const stinkPuffGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const stinkPuffMat = new THREE.MeshBasicMaterial({ color: 0x84cc16, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(stinkPuffGeo, stinkPuffMat);
      puff.position.set((Math.random() - 0.5) * 0.4, 0.95 + i * 0.22, (Math.random() - 0.5) * 0.4);
      group.add(puff);
    }

    return group;
  },

  createStinkExplosion(pos, gameState) {
    const stinkGroup = new THREE.Group();
    stinkGroup.position.copy(pos);
    gameState.scene.add(stinkGroup);

    // 1. 膨張する異臭の煙玉（黄緑）
    const cloudGeo = new THREE.SphereGeometry(2.0, 16, 16);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x84cc16,
      transparent: true,
      opacity: 0.85
    });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    stinkGroup.add(cloud);

    // 2. 拡散する悪臭の衝撃波リング（半径18mを可視化）
    const ringGeo = new THREE.RingGeometry(1.0, 2.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa3e635,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.25;
    stinkGroup.add(ring);

    // 3. 黄緑色の閃光ライト
    const light = new THREE.PointLight(0x84cc16, 4, 20);
    stinkGroup.add(light);

    let life = 0.9;
    const anim = () => {
      life -= 0.025;
      if (life <= 0) {
        gameState.scene.remove(stinkGroup);
        return;
      }
      const progress = 1.0 - (life / 0.9);
      const scale = 1.0 + progress * 7.5; // 半径約18mまで急速拡大
      cloud.scale.set(scale * 0.9, scale * 0.6, scale * 0.9);
      cloudMat.opacity = Math.max(0, 0.85 * (1.0 - progress));
      ring.scale.set(scale, scale, 1);
      ringMat.opacity = Math.max(0, 0.8 * (1.0 - progress));
      light.intensity = 4 * (1.0 - progress);
      requestAnimationFrame(anim);
    };
    anim();
  },

  spawnPoop(kart, gameState, throwDirection = 'backward') {
    const group = Items.createPoopMesh();
    let velocity = new THREE.Vector3();
    let vy = 0;
    let isAirborne = false;

    if (throwDirection === 'forward') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.rotation);
      group.position.copy(kart.position).addScaledVector(forward, 2.5);
      group.position.y = kart.position.y + 1.2;
      const kartSpeed = (kart.speed || 0);
      velocity = forward.clone().multiplyScalar(Math.max(25, kartSpeed + 22));
      vy = 12.0; // 上向き初速（放物線）
      isAirborne = true;
    } else {
      const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.rotation);
      group.position.copy(kart.position).addScaledVector(backward, 3.2);
      group.position.y = kart.position.y + 0.4;
    }

    gameState.scene.add(group);

    return {
      type: 'poop',
      mesh: group,
      ownerId: kart.id,
      radius: 1.3,
      active: true,
      canBlockShell: true,
      ownerGraceTimer: 1.2,
      update(dt) {
        if (this.ownerGraceTimer > 0) this.ownerGraceTimer -= dt;
        if (isAirborne) {
          vy -= 26.0 * dt;
          group.position.addScaledVector(velocity, dt);
          group.position.y += vy * dt;
          group.rotation.x += dt * 6.0;

          const groundY = gameState.getTrackHeightAt(group.position);
          if (group.position.y <= groundY + 0.35) {
            group.position.y = groundY + 0.35;
            isAirborne = false;
            velocity.set(0, 0, 0);
            group.rotation.set(0, 0, 0);
          }
        } else {
          group.rotation.y += dt * 1.5;
        }
      },
      destroy() {
        if (!this.active) return;
        this.active = false;
        gameState.scene.remove(group);
      },
      onHit(targetKart) {
        if (!this.active) return;
        this.destroy();

        // 1. 直撃したカートはスピン＆異臭デバフ
        targetKart.spinOut();
        targetKart.applyStinkDebuff?.(5.0, gameState);

        // 2. 異臭爆発エフェクト
        Items.createStinkExplosion(group.position, gameState);

        // 3. 周囲半径18mの全カートに異臭パワー減速デバフ（45%減速）を拡散
        const stinkRadius = 18.0;
        const allKarts = [gameState.localPlayerKart, ...Array.from(gameState.otherPlayers.values()).map(p => p.physics)];
        let hitOthersCount = 0;
        allKarts.forEach(k => {
          if (!k || k.isRespawning) return;
          const d = k.mesh.position.distanceTo(group.position);
          if (d < stinkRadius) {
            k.applyStinkDebuff?.(4.0, gameState);
            if (k !== targetKart) hitOthersCount++;
          }
        });

        if (this.ownerId === gameState.localPlayerKart?.id) {
          if (targetKart !== gameState.localPlayerKart) {
            gameState.showItemNotification('💩 うんちに敵がヒット！異臭パワーで周囲も減速！', 3000);
          }
        } else if (targetKart === gameState.localPlayerKart) {
          gameState.showItemNotification('💩 うんちを踏んでしまった！強烈な悪臭！', 3000);
        }
      }
    };
  },

  spawnShell(kart, colorType, gameState) {
    const group = new THREE.Group();
    const shellGeo = new THREE.SphereGeometry(0.6, 16, 12);
    shellGeo.scale(1, 0.7, 1.2);
    const shellMat = new THREE.MeshStandardMaterial({
      color: colorType === 'green' ? 0x2ecc71 : 0xe74c3c,
      roughness: 0.3
    });
    group.add(new THREE.Mesh(shellGeo, shellMat));

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.rotation);
    group.position.copy(kart.position).addScaledVector(forward, 3.5);
    group.position.y = kart.position.y + 0.5;
    gameState.scene.add(group);

    // 赤甲羅の弾速を倍速（96）、緑甲羅（105）
    let velocity = forward.clone().multiplyScalar(colorType === 'green' ? 105 : 96);
    let target = null;
    let bouncesLeft = 4;

    if (colorType === 'red') {
      target = gameState.findTargetKartAhead(kart);
    }

    let lifetime = 8.0;

    return {
      type: `${colorType}_shell`,
      mesh: group,
      ownerId: kart.id,
      radius: 1.2,
      active: true,
      canBlockShell: true,
      update(dt) {
        lifetime -= dt;
        if (lifetime <= 0) {
          this.destroy();
          return;
        }

        group.rotation.y += dt * 12.0;

        if (colorType === 'red' && target && !target.isFinished) {
          const dir = new THREE.Vector3().subVectors(target.position, group.position).normalize();
          dir.y = 0;
          velocity.lerp(dir.multiplyScalar(96), dt * 6.5);
        } else if (colorType === 'green' && gameState.courseTrack) {
          const t = gameState.localPlayerKart.findNearestTrackT(gameState.courseTrack.curve, group.position);
          const trackCenter = gameState.courseTrack.curve.getPointAt(t);
          const distFromCenter = new THREE.Vector2(group.position.x - trackCenter.x, group.position.z - trackCenter.z).length();
          const halfWidth = (gameState.currentCourseConfig.trackWidth || 32) / 2;

          if (distFromCenter > halfWidth - 1.0 && bouncesLeft > 0) {
            bouncesLeft--;
            const normal = new THREE.Vector3(trackCenter.x - group.position.x, 0, trackCenter.z - group.position.z).normalize();
            velocity.reflect(normal).multiplyScalar(0.95);
          }
        }

        group.position.addScaledVector(velocity, dt);

        const courseY = gameState.getTrackHeightAt(group.position);
        group.position.y = THREE.MathUtils.lerp(group.position.y, courseY + 0.5, dt * 6);
      },
      destroy() {
        if (!this.active) return;
        this.active = false;
        gameState.scene.remove(group);
      },
      onHit(targetKart) {
        if (!this.active) return;
        this.destroy();
        targetKart.spinOut();
        if (this.ownerId === gameState.localPlayerKart?.id && targetKart !== gameState.localPlayerKart) {
          const name = colorType === 'green' ? 'ミドリカメ' : 'アカカメ';
          gameState.showItemNotification(`${name}が敵カートに命中！💥`, 2500);
        }
      }
    };
  },

  spawnBlueShell(kart, gameState) {
    const group = new THREE.Group();
    const shellGeo = new THREE.SphereGeometry(0.8, 16, 12);
    shellGeo.scale(1, 0.75, 1.2);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x2980b9,
      roughness: 0.2,
      metalness: 0.4
    });
    group.add(new THREE.Mesh(shellGeo, shellMat));

    const light = new THREE.PointLight(0x00a8ff, 2, 10);
    group.add(light);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.rotation);
    group.position.copy(kart.position).addScaledVector(forward, 3.5);
    group.position.y = kart.position.y + 3.0;
    gameState.scene.add(group);

    // 青甲羅の速度を倍速（120）に高速化
    let velocity = forward.clone().multiplyScalar(120);
    let lifetime = 12.0;

    return {
      type: 'blue_shell',
      mesh: group,
      ownerId: kart.id,
      radius: 1.8,
      active: true,
      canBlockShell: false,
      update(dt) {
        lifetime -= dt;
        if (lifetime <= 0) {
          this.destroy();
          return;
        }

        group.rotation.y += dt * 18.0;

        const leaderKart = gameState.calculateRankings()[0];
        if (leaderKart) {
          const dir = new THREE.Vector3().subVectors(leaderKart.position, group.position).normalize();
          dir.y = 0;
          velocity.lerp(dir.multiplyScalar(120), dt * 8.0);

          const dist2D = new THREE.Vector2(group.position.x - leaderKart.position.x, group.position.z - leaderKart.position.z).length();
          if (dist2D < 4.5) {
            group.position.y = THREE.MathUtils.lerp(group.position.y, leaderKart.position.y + 0.3, dt * 14);
          } else {
            group.position.y = THREE.MathUtils.lerp(group.position.y, leaderKart.position.y + 3.2, dt * 6);
          }
        }

        group.position.addScaledVector(velocity, dt);
      },
      destroy() {
        if (!this.active) return;
        this.active = false;
        gameState.scene.remove(group);
      },
      onHit(targetKart) {
        if (!this.active) return;
        Items.createExplosionEffect(group.position, gameState, 0x38bdf8);
        this.destroy();

        if (targetKart.invincibleTimer > 0) {
          gameState.showItemNotification('スターで青こうらの爆発を防御！');
        } else {
          targetKart.spinOut();
          if (targetKart === gameState.localPlayerKart) {
            gameState.showItemNotification('1位を狙う青こうらに被弾！！');
          } else if (this.ownerId === gameState.localPlayerKart?.id) {
            gameState.showItemNotification('青こうらが首位カートに命中・大爆発！💥', 2800);
          }
        }
      }
    };
  },

  spawnBobomb(kart, gameState, throwDirection = 'backward') {
    const group = new THREE.Group();
    const bombGeo = new THREE.SphereGeometry(0.7, 16, 14);
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    group.add(new THREE.Mesh(bombGeo, bombMat));

    let velocity = new THREE.Vector3();
    let vy = 0;
    let hasLanded = false;
    let fuseTimer = 3.2;
    let ownerGraceTimer = 1.0; // 投擲主への当たり判定無効時間（自爆防止）

    if (throwDirection === 'forward') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.rotation);
      // カートの前方上方から発射
      group.position.copy(kart.position).addScaledVector(forward, 3.8);
      group.position.y = kart.position.y + 1.5;
      const kartSpeed = Math.max(0, kart.speed || 0);
      velocity = forward.clone().multiplyScalar(Math.max(28, kartSpeed + 26));
      vy = 13.0; // 前方放物線の初速
      hasLanded = false;
    } else {
      // 単押し後方ドロップ
      const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.rotation);
      group.position.copy(kart.position).addScaledVector(backward, 3.2);
      group.position.y = kart.position.y + 0.4;
      hasLanded = true;
      fuseTimer = 4.0; // 後方に置いた場合は少し長めの起爆時間
    }
    gameState.scene.add(group);

    return {
      type: 'bobomb',
      mesh: group,
      ownerId: kart.id,
      radius: 2.2, // 接触起爆半径（爆風は9.0）
      active: true,
      canBlockShell: true,
      hasLanded,
      ownerGraceTimer,
      update(dt) {
        if (ownerGraceTimer > 0) {
          ownerGraceTimer -= dt;
          this.ownerGraceTimer = ownerGraceTimer;
        }

        fuseTimer -= dt;
        if (fuseTimer <= 0) {
          this.explode();
          return;
        }

        if (!hasLanded) {
          vy -= 26.0 * dt;
          group.position.addScaledVector(velocity, dt);
          group.position.y += vy * dt;

          const groundY = gameState.getTrackHeightAt(group.position);
          if (group.position.y <= groundY + 0.4) {
            group.position.y = groundY + 0.4;
            hasLanded = true;
            this.hasLanded = true;
            velocity.set(0, 0, 0);
          }
        } else {
          // 点滅演出 (導火線の危機感)
          const blink = Math.sin(performance.now() * 0.02) > 0;
          bombMat.color.setHex(blink ? 0xef4444 : 0x1e293b);
          group.rotation.y += dt * 8.0;
        }
      },
      explode() {
        if (!this.active) return;
        // 爆発エフェクトの発生！
        Items.createExplosionEffect(group.position, gameState, 0xf97316);
        this.destroy();

        const allKarts = [gameState.localPlayerKart, ...Array.from(gameState.otherPlayers.values()).map(p => p.physics)];
        let hitEnemy = false;
        allKarts.forEach(k => {
          if (k && group.position.distanceTo(k.position) < 9.0) {
            k.spinOut();
            if (k !== gameState.localPlayerKart) {
              hitEnemy = true;
            }
          }
        });

        if (this.ownerId === gameState.localPlayerKart?.id && hitEnemy) {
          gameState.showItemNotification('ボムへいの爆風が敵に命中！💣💥', 2600);
        }
      },
      destroy() {
        if (!this.active) return;
        this.active = false;
        gameState.scene.remove(group);
      },
      onHit(targetKart) {
        this.explode();
      }
    };
  },

  /**
   * ボム兵・青甲羅の3D爆発エフェクト（火炎球 + 衝撃波リング + 飛散火花パーティクル）
   */
  createExplosionEffect(pos, gameState, primaryColor = 0xf97316) {
    const explosionGroup = new THREE.Group();
    explosionGroup.position.copy(pos);
    gameState.scene.add(explosionGroup);

    // 1. 膨張する火炎球
    const fireballGeo = new THREE.SphereGeometry(1.5, 16, 16);
    const fireballMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.9
    });
    const fireball = new THREE.Mesh(fireballGeo, fireballMat);
    explosionGroup.add(fireball);

    // 2. 拡散する衝撃波リング
    const shockwaveGeo = new THREE.RingGeometry(0.8, 1.6, 32);
    shockwaveGeo.rotateX(-Math.PI / 2);
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const shockwave = new THREE.Mesh(shockwaveGeo, shockwaveMat);
    shockwave.position.y = 0.2;
    explosionGroup.add(shockwave);

    // 3. 瞬間的な強烈閃光ライト
    const flashLight = new THREE.PointLight(primaryColor, 5, 25);
    explosionGroup.add(flashLight);

    let life = 0.6; // 0.6秒で消滅
    const anim = () => {
      life -= 0.025;
      if (life <= 0) {
        gameState.scene.remove(explosionGroup);
        return;
      }

      const progress = 1.0 - (life / 0.6); // 0.0 -> 1.0
      // 火球の急速膨張とフェードアウト
      const scale = 1.0 + progress * 5.0;
      fireball.scale.set(scale, scale * 1.2, scale);
      fireballMat.opacity = Math.max(0, 1.0 - progress);

      // 衝撃波リングの拡散
      const waveScale = 1.0 + progress * 8.0;
      shockwave.scale.set(waveScale, waveScale, waveScale);
      shockwaveMat.opacity = Math.max(0, 1.0 - progress);

      flashLight.intensity = Math.max(0, 5 * (1.0 - progress));

      requestAnimationFrame(anim);
    };
    anim();
  },

  spawnDroppedMushroom(pos, gameState) {
    const group = new THREE.Group();
    const capGeo = new THREE.SphereGeometry(0.6, 12, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
    group.add(new THREE.Mesh(capGeo, capMat));

    group.position.copy(pos);
    group.position.y = gameState.getTrackHeightAt(pos) + 0.4;
    gameState.scene.add(group);

    return {
      type: 'dropped_mushroom',
      mesh: group,
      radius: 1.5,
      active: true,
      canBlockShell: false,
      update(dt) {
        group.rotation.y += dt * 3.0;
      },
      destroy() {
        if (!this.active) return;
        this.active = false;
        gameState.scene.remove(group);
      },
      onHit(targetKart) {
        if (!this.active) return;
        this.destroy();
        targetKart.applyBoost(1.5, 2.0);
        if (targetKart === gameState.localPlayerKart) {
          gameState.showItemNotification('コース上のキノコを拾ってダッシュ！');
        }
      }
    };
  },

  triggerLightning(userKart, gameState) {
    // 現在の順位一覧を取得
    const ranking = gameState.calculateRankings ? gameState.calculateRankings() : [];
    const userRankIndex = ranking.findIndex(k => k === userKart);

    if (userKart.isLocalPlayer) {
      gameState.showItemNotification('⚡ サンダー発動！前方のライバル達を直撃！');
    }

    ranking.forEach((target, rankIdx) => {
      if (!target || target === userKart) return;

      // 使用者より前の順位のカートのみを対象にする (rankIdx < userRankIndex)
      // もし順位が取れなかった場合は全体対象のフォールバック
      if (userRankIndex !== -1 && rankIdx >= userRankIndex) {
        return; // 使用者より後ろのプレイヤーは被弾しない
      }

      if (target.invincibleTimer > 0) {
        if (target.isLocalPlayer) gameState.showItemNotification('スターでサンダーを無効化！');
        return;
      }

      // 1. スピン
      target.spinOut();

      // 2. スモール化：上位（1位）ほど長く、下位から順に解除される
      // 1位: 6.0秒、2位: 4.5秒、3位: 3.0秒 ...
      const duration = Math.max(2.5, 6.0 - rankIdx * 1.5);
      if (typeof target.applySmall === 'function') {
        target.applySmall(duration);
      }

      // 3. アイテムロスト
      if (target.holdingItem) {
        if (target.holdingItem.id.includes('mushroom')) {
          const dropped = Items.spawnDroppedMushroom(target.position, gameState);
          gameState.activeWorldItems.push(dropped);
        }
        target.holdingItem = null;
      }

      if (target.isLocalPlayer) {
        gameState.showItemNotification(`⚡ サンダー被弾！小さくなって速度低下 (${Math.round(duration)}秒)！`);
      }
    });
  }
};
