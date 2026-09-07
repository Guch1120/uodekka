// frontend/items/items.js
// マリオカート風アイテムの定義・効果・3Dモデル生成モジュール
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { Icons } from '../icons/icons.js';

export const ItemTypes = {
  MUSHROOM: 'mushroom',
  GREEN_SHELL: 'green_shell',
  RED_SHELL: 'red_shell',
  BANANA: 'banana',
  STAR: 'star'
};

export const Items = {
  definitions: {
    mushroom: {
      id: 'mushroom',
      name: 'ダッシュキノコ',
      icon: 'mushroom',
      rarity: 35, // 出現確率ウェイト
      use(kart, gameState) {
        kart.applyBoost(1.7, 3.0); // 1.7倍速、3秒間
        if (kart.isLocalPlayer) {
          gameState.showItemNotification('ダッシュキノコ発動！加速！');
        }
      }
    },
    green_shell: {
      id: 'green_shell',
      name: 'ミドリカメ',
      icon: 'green_shell',
      rarity: 25,
      use(kart, gameState) {
        const shell = Items.spawnShell(kart, 'green', gameState);
        gameState.activeWorldItems.push(shell);
      }
    },
    red_shell: {
      id: 'red_shell',
      name: 'アカカメ',
      icon: 'red_shell',
      rarity: 20,
      use(kart, gameState) {
        const shell = Items.spawnShell(kart, 'red', gameState);
        gameState.activeWorldItems.push(shell);
      }
    },
    banana: {
      id: 'banana',
      name: 'バナナ',
      icon: 'banana',
      rarity: 20,
      use(kart, gameState) {
        const banana = Items.spawnBanana(kart, gameState);
        gameState.activeWorldItems.push(banana);
      }
    },
    star: {
      id: 'star',
      name: 'スーパースター',
      icon: 'star',
      rarity: 10,
      use(kart, gameState) {
        kart.applyInvincible(8.0); // 8秒無敵 & 超高速
        if (kart.isLocalPlayer) {
          gameState.showItemNotification('スーパースター！無敵＆最高速！');
        }
      }
    }
  },

  getRandomItem(position = 1, totalPlayers = 4) {
    // 順位に応じたアイテム補正
    const pool = [];
    if (position === 1) {
      pool.push('banana', 'banana', 'green_shell', 'green_shell', 'mushroom');
    } else if (position === 2) {
      pool.push('green_shell', 'red_shell', 'mushroom', 'banana');
    } else {
      pool.push('red_shell', 'mushroom', 'mushroom', 'star', 'green_shell');
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return this.definitions[picked];
  },

  /**
   * コース上に浮遊回転するアイテムボックスの3Dメッシュ生成
   */
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
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      wireframe: true
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    group.add(inner);

    return group;
  },

  spawnBanana(kart, gameState) {
    const group = new THREE.Group();
    const meshGeo = new THREE.ConeGeometry(0.5, 0.9, 6);
    const meshMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.3 });
    const mesh = new THREE.Mesh(meshGeo, meshMat);
    mesh.rotation.x = Math.PI;
    group.add(mesh);

    // カートの後ろに配置
    const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.rotation);
    group.position.copy(kart.position).addScaledVector(backward, 3.5);
    group.position.y = kart.position.y + 0.4;
    gameState.scene.add(group);

    return {
      type: 'banana',
      mesh: group,
      ownerId: kart.id,
      radius: 1.2,
      active: true,
      update(dt) {
        group.rotation.y += dt * 2.0;
      },
      onHit(targetKart) {
        if (!this.active) return;
        this.active = false;
        targetKart.spinOut();
        gameState.scene.remove(group);
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
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    group.add(mesh);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.rotation);
    group.position.copy(kart.position).addScaledVector(forward, 3.5);
    group.position.y = kart.position.y + 0.5;
    gameState.scene.add(group);

    let velocity = forward.clone().multiplyScalar(colorType === 'green' ? 45 : 40);
    let target = null;

    if (colorType === 'red') {
      // 1つ前の順位のカートをターゲットにする
      target = gameState.findTargetKartAhead(kart);
    }

    let lifetime = 8.0;

    return {
      type: `${colorType}_shell`,
      mesh: group,
      ownerId: kart.id,
      radius: 1.2,
      active: true,
      update(dt) {
        lifetime -= dt;
        if (lifetime <= 0) {
          this.destroy();
          return;
        }

        group.rotation.y += dt * 10.0;

        if (colorType === 'red' && target && !target.isFinished) {
          // ターゲットを自動追尾
          const dir = new THREE.Vector3().subVectors(target.position, group.position).normalize();
          dir.y = 0;
          velocity.lerp(dir.multiplyScalar(45), dt * 4);
        }

        group.position.addScaledVector(velocity, dt);

        // コーススプライン沿いの高さをキープ
        const courseY = gameState.getTrackHeightAt(group.position);
        group.position.y = THREE.MathUtils.lerp(group.position.y, courseY + 0.5, dt * 5);
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
  }
};
