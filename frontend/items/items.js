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

  getRandomItem(position = 1, totalPlayers = 4) {
    let pool = [];

    if (position === 1) {
      pool = [
        'banana', 'banana', 'banana',
        'triple_banana', 'triple_banana',
        'green_shell', 'green_shell',
        'red_shell',
        'bobomb'
      ];
    } else if (position === 2) {
      pool = [
        'red_shell', 'red_shell',
        'green_shell', 'green_shell',
        'triple_banana', 'banana',
        'mushroom', 'bobomb'
      ];
    } else if (position === 3) {
      pool = [
        'red_shell', 'red_shell',
        'triple_mushroom', 'triple_mushroom',
        'mushroom',
        'bobomb',
        'star'
      ];
      if (!this.lightningHeld) pool.push('lightning');
    } else {
      pool = [
        'star', 'star', 'star',
        'triple_mushroom', 'triple_mushroom', 'triple_mushroom',
        'blue_shell', 'blue_shell',
        'bobomb',
        'mushroom'
      ];
      if (!this.lightningHeld) {
        pool.push('lightning', 'lightning');
      }
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

    // 緑甲羅の弾速を倍速（約105）に向上して爽快な狙撃を可能にする
    let velocity = forward.clone().multiplyScalar(colorType === 'green' ? 105 : 46);
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

        group.rotation.y += dt * 10.0;

        if (colorType === 'red' && target && !target.isFinished) {
          const dir = new THREE.Vector3().subVectors(target.position, group.position).normalize();
          dir.y = 0;
          velocity.lerp(dir.multiplyScalar(48), dt * 4.5);
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

    let velocity = forward.clone().multiplyScalar(58);
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

        group.rotation.y += dt * 14.0;

        const leaderKart = gameState.calculateRankings()[0];
        if (leaderKart) {
          const dir = new THREE.Vector3().subVectors(leaderKart.position, group.position).normalize();
          dir.y = 0;
          velocity.lerp(dir.multiplyScalar(58), dt * 6.0);

          const dist2D = new THREE.Vector2(group.position.x - leaderKart.position.x, group.position.z - leaderKart.position.z).length();
          if (dist2D < 4.5) {
            group.position.y = THREE.MathUtils.lerp(group.position.y, leaderKart.position.y + 0.3, dt * 12);
          } else {
            group.position.y = THREE.MathUtils.lerp(group.position.y, leaderKart.position.y + 3.2, dt * 5);
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

    if (throwDirection === 'forward') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.rotation);
      group.position.copy(kart.position).addScaledVector(forward, 2.5);
      group.position.y = kart.position.y + 1.2;
      const kartSpeed = (kart.speed || 0);
      velocity = forward.clone().multiplyScalar(Math.max(24, kartSpeed + 20));
      vy = 14.0;
      hasLanded = false;
    } else {
      // 単押し後方ドロップ
      const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.rotation);
      group.position.copy(kart.position).addScaledVector(backward, 3.0);
      group.position.y = kart.position.y + 0.4;
      hasLanded = true;
      fuseTimer = 4.0; // 後方に置いた場合は少し長めの起爆時間
    }
    gameState.scene.add(group);

    return {
      type: 'bobomb',
      mesh: group,
      ownerId: kart.id,
      radius: 3.5,
      active: true,
      canBlockShell: true,
      update(dt) {
        fuseTimer -= dt;
        if (fuseTimer <= 0) {
          this.explode();
          return;
        }

        if (!hasLanded) {
          vy -= 28.0 * dt;
          group.position.addScaledVector(velocity, dt);
          group.position.y += vy * dt;

          const groundY = gameState.getTrackHeightAt(group.position);
          if (group.position.y <= groundY + 0.4) {
            group.position.y = groundY + 0.4;
            hasLanded = true;
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
        allKarts.forEach(k => {
          if (k && group.position.distanceTo(k.position) < 9.0) {
            k.spinOut();
          }
        });
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
    const allKarts = [gameState.localPlayerKart, ...Array.from(gameState.otherPlayers.values()).map(p => p.physics)];

    if (userKart.isLocalPlayer) {
      gameState.showItemNotification('⚡ サンダー発動！ライバル達を直撃！');
    }

    allKarts.forEach(target => {
      if (!target || target === userKart) return;

      if (target.invincibleTimer > 0) {
        if (target.isLocalPlayer) gameState.showItemNotification('スターでサンダーを無効化！');
        return;
      }

      target.spinOut();
      if (target.holdingItem) {
        if (target.holdingItem.id.includes('mushroom')) {
          const dropped = Items.spawnDroppedMushroom(target.position, gameState);
          gameState.activeWorldItems.push(dropped);
        }
        target.holdingItem = null;
      }

      if (target.isLocalPlayer) {
        gameState.showItemNotification('⚡ サンダー被弾！アイテムをロスト！');
      }
    });
  }
};
