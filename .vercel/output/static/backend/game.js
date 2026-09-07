// backend/game.js
// レースゲーム全体のループ制御、プレイヤー/CPUの初期化、障害物当たり判定、通信同期
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GameRenderer } from './engine/renderer.js';
import { KartPhysics } from './engine/physics.js';
import { FollowCamera } from './engine/camera.js';
import { InputManager } from './input/input_manager.js';
import { P2PManager } from './network/p2p_manager.js';

import { Vehicles } from '../frontend/vehicles/vehicles.js';
import { Courses } from '../frontend/courses/index.js';
import { Items } from '../frontend/items/items.js';
import { HUD } from '../frontend/ui/hud.js';
import { SettingsModal } from '../frontend/ui/settings_modal.js';
import { LobbyModal } from '../frontend/ui/lobby_modal.js';
import { PauseModal } from '../frontend/ui/pause_modal.js';
import { EditorModal } from '../frontend/ui/editor_modal.js';

export class Game {
  constructor() {
    this.appContainer = document.getElementById('app');

    // レンダラー
    this.renderer = new GameRenderer(this.appContainer);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;

    // 入力管理 & 追従カメラ
    this.inputManager = new InputManager(this.appContainer);
    this.followCamera = new FollowCamera(this.camera, null);

    // サーバーレスP2P通信管理
    this.p2p = new P2PManager();

    // UI
    this.hud = new HUD(this.appContainer);
    this.settingsModal = new SettingsModal(this.appContainer, this.inputManager);
    this.pauseModal = new PauseModal(
      this.appContainer,
      () => this.resumeRace(),
      () => this.restartRace(),
      () => this.quitRace()
    );

    // レース状態
    this.isRunning = false;
    this.isPaused = false;
    this.currentGameConfig = null;
    this.currentCourseConfig = null;
    this.courseTrack = null;
    this.courseObstacles = []; // 木や岩などの当たり判定オブジェクト

    this.localPlayerKart = null;
    this.otherPlayers = new Map();
    this.activeWorldItems = [];
    this.itemBoxes = [];

    this.clock = new THREE.Clock();

    this.initUIListeners();

    // コースエディタモーダル
    this.editorModal = new EditorModal(this.appContainer, (customCourseId) => {
      this.lobbyModal.hide();
      this.startRace({
        mode: 'solo',
        courseId: customCourseId,
        vehicleKey: 'standard_red',
        isHost: true
      });
    });

    // ロビーモーダル起動
    this.lobbyModal = new LobbyModal(this.appContainer, this.p2p, (gameConfig) => {
      this.startRace(gameConfig);
    }, this.inputManager);
    this.lobbyModal.onOpenEditor = () => {
      this.editorModal.show();
    };

    this.setupNetworkEvents();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initUIListeners() {
    document.getElementById('btn-open-settings').onclick = () => {
      this.settingsModal.show();
    };

    const btnPause = document.getElementById('btn-open-pause');
    if (btnPause) {
      btnPause.onclick = () => {
        this.openPauseMenu();
      };
    }

    // 画面強制横持ちボタン
    const btnForceLandscape = document.getElementById('btn-force-landscape');
    if (btnForceLandscape) {
      btnForceLandscape.onclick = () => {
        this.enableForcedLandscape();
      };
    }

    // 画面サイズ・向き変化監視（横向きになったらプロンプトを閉じ、サイズ再計算）
    window.addEventListener('resize', () => {
      if (window.innerWidth > window.innerHeight) {
        const orientationPrompt = document.getElementById('orientation-prompt');
        if (orientationPrompt) orientationPrompt.classList.add('dismissed');
      }
      if (this.renderer) this.renderer.onResize();
    });
  }

  openPauseMenu() {
    const isMulti = this.currentGameConfig && (this.currentGameConfig.mode === 'multi_host' || this.currentGameConfig.mode === 'multi_guest');
    if (!isMulti) {
      this.isPaused = true;
    }
    this.pauseModal.show(isMulti ? 'multi' : 'solo');
  }

  resumeRace() {
    this.isPaused = false;
    this.clock.getDelta(); // ポーズ中の経過時間をクリア
  }

  restartRace() {
    this.isPaused = false;
    if (this.currentGameConfig) {
      this.startRace(this.currentGameConfig);
    }
  }

  quitRace() {
    this.isPaused = false;
    this.isRunning = false;

    // HUDおよび操作UIを非表示
    if (this.hud) this.hud.hide();
    if (this.inputManager) this.inputManager.hideControls();

    // P2P接続中なら切断
    if (this.p2p && this.p2p.peer) {
      try {
        this.p2p.peer.destroy();
      } catch (e) {
        console.warn(e);
      }
    }
    // ロビー画面を再表示
    this.lobbyModal.show();
  }

  enableForcedLandscape() {
    const orientationPrompt = document.getElementById('orientation-prompt');
    if (orientationPrompt) {
      orientationPrompt.classList.add('dismissed');
    }

    // 全画面リクエストを試行
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen().catch(() => {});
    }

    const applyLandscapeLayout = () => {
      document.body.classList.add('force-landscape');
      if (this.renderer) {
        this.renderer.onResize();
      }
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => {
        if (this.renderer) this.renderer.onResize();
        window.dispatchEvent(new Event('resize'));
      }, 100);
      setTimeout(() => {
        if (this.renderer) this.renderer.onResize();
        window.dispatchEvent(new Event('resize'));
      }, 300);
    };

    // Orientation Lock を試行
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').then(() => {
        if (this.renderer) this.renderer.onResize();
        window.dispatchEvent(new Event('resize'));
      }).catch(() => {
        // OS等の制約でロック不可の場合、CSSで90度回転
        applyLandscapeLayout();
      });
    } else {
      applyLandscapeLayout();
    }
  }

  setupNetworkEvents() {
    this.p2p.onPeerStateReceived = (peerId, state) => {
      let peerKart = this.otherPlayers.get(peerId);
      if (!peerKart) {
        const mesh = Vehicles.createKartMesh(state.vehicleKey || 'speed_blue');
        this.scene.add(mesh);
        const physics = new KartPhysics(mesh, Vehicles.types[state.vehicleKey || 'speed_blue'], false);
        peerKart = { id: peerId, mesh, physics, isAI: false };
        this.otherPlayers.set(peerId, peerKart);
      }

      peerKart.mesh.position.set(state.x, state.y, state.z);
      peerKart.mesh.quaternion.set(state.qx, state.qy, state.qz, state.qw);
      peerKart.physics.currentLap = state.lap;
      peerKart.physics.progress = state.progress;
      peerKart.physics.speed = state.speed;
    };

    this.p2p.onItemEvent = (itemEvent) => {
      if (itemEvent.itemType === 'banana') {
        const dummyKart = { id: itemEvent.ownerId, position: new THREE.Vector3(...itemEvent.pos), rotation: new THREE.Quaternion(...itemEvent.rot) };
        const b = Items.spawnBanana(dummyKart, this);
        this.activeWorldItems.push(b);
      } else if (itemEvent.itemType === 'lightning') {
        Items.triggerLightning({ id: itemEvent.ownerId, isLocalPlayer: false }, this);
      }
    };
  }

  showItemNotification(text) {
    this.hud.showNotification(text);
  }

  startRace(config) {
    while (this.scene.children.length > 2) {
      const obj = this.scene.children[this.scene.children.length - 1];
      this.scene.remove(obj);
    }
    this.otherPlayers.clear();
    this.activeWorldItems = [];
    this.itemBoxes = [];
    this.courseObstacles = [];
    this._finishedNotified = false;
    Items.lightningHeld = false;
    this.hud.resetLaps();

    this.currentCourseConfig = Courses.getCourse(config.courseId);
    this.renderer.setSkyAndTheme(this.currentCourseConfig.skyColor, this.currentCourseConfig.ambientColor);

    this.courseTrack = Courses.buildTrack(this.currentCourseConfig);
    this.scene.add(this.courseTrack.group);

    if (this.currentCourseConfig.createEnvironment) {
      const envGroup = this.currentCourseConfig.createEnvironment(this.scene);
      this.scene.add(envGroup);
      if (envGroup.userData && envGroup.userData.obstacles) {
        this.courseObstacles = [...envGroup.userData.obstacles];
      }
    }

    // タイヤウォール衝突判定オブジェクトを追加
    if (this.courseTrack.tireWallObstacles && this.courseTrack.tireWallObstacles.length > 0) {
      this.courseObstacles.push(...this.courseTrack.tireWallObstacles);
    }

    this.spawnItemBoxes();

    const curve = this.courseTrack.curve;
    const startT = 0.02;
    const p0 = curve.getPointAt(startT);
    const forward = curve.getTangentAt(startT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(forward, up).normalize();

    const localKartMesh = Vehicles.createKartMesh(config.vehicleKey);
    localKartMesh.position.copy(p0).addScaledVector(normal, 4.0);
    localKartMesh.position.y += 0.4;

    const startYaw = Math.atan2(-forward.x, -forward.z);
    localKartMesh.rotation.set(0, startYaw, 0, 'YXZ');
    this.scene.add(localKartMesh);

    const vehicleConfig = Vehicles.types[config.vehicleKey] || Vehicles.types.standard_red;
    this.localPlayerKart = new KartPhysics(localKartMesh, vehicleConfig, true);
    this.localPlayerKart.totalLaps = this.currentCourseConfig.totalLaps;
    this.localPlayerKart.progress = startT;
    this.localPlayerKart.lastSafeT = startT;

    this.followCamera.setTarget(localKartMesh);

    if (config.mode === 'solo') {
      this.spawnAICarts(config.vehicleKey);
    }

    this.currentGameConfig = config;
    this.isPaused = false;
    this.isRunning = true;

    // レース開始時にHUDとタッチコントロールを表示
    if (this.hud) this.hud.show();
    if (this.inputManager) this.inputManager.showControls();

    this.showItemNotification('レーススタート！ GO!', 2500);
  }

  spawnItemBoxes() {
    const locs = this.currentCourseConfig.itemBoxLocations || [0.2, 0.5, 0.8];
    const curve = this.courseTrack.curve;
    const up = new THREE.Vector3(0, 1, 0);

    locs.forEach(t => {
      const center = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      [-8, -4, 0, 4, 8].forEach(offset => {
        const boxMesh = Items.createItemBoxMesh();
        boxMesh.position.copy(center).addScaledVector(normal, offset);
        boxMesh.position.y += 1.2;
        this.scene.add(boxMesh);

        this.itemBoxes.push({
          mesh: boxMesh,
          pos: boxMesh.position,
          active: true,
          respawnTimer: 0
        });
      });
    });
  }

  spawnAICarts(playerVehicleKey) {
    const aiKeys = ['speed_blue', 'handling_green', 'standard_red'].filter(k => k !== playerVehicleKey);
    const curve = this.courseTrack.curve;
    const up = new THREE.Vector3(0, 1, 0);

    const gridT = [0.035, 0.030, 0.025];
    const gridOffsets = [-4.0, 4.0, -4.0];

    for (let i = 0; i < 3; i++) {
      const vKey = aiKeys[i % aiKeys.length];
      const mesh = Vehicles.createKartMesh(vKey);

      const t = gridT[i];
      const p = curve.getPointAt(t);
      const forward = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3().crossVectors(forward, up).normalize();

      mesh.position.copy(p).addScaledVector(normal, gridOffsets[i]);
      mesh.position.y += 0.4;

      const yaw = Math.atan2(-forward.x, -forward.z);
      mesh.rotation.set(0, yaw, 0, 'YXZ');
      this.scene.add(mesh);

      const physics = new KartPhysics(mesh, Vehicles.types[vKey], false);
      physics.totalLaps = this.currentCourseConfig.totalLaps;
      physics.progress = t;
      physics.lastSafeT = t;

      this.otherPlayers.set(`ai_${i}`, {
        id: `ai_${i}`,
        mesh,
        physics,
        isAI: true,
        aiOffset: gridOffsets[i] * 0.7,
        speedMultiplier: 0.88 + (i * 0.04)
      });
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.isRunning && this.localPlayerKart && !this.isPaused) {
      this.updateGame(dt);
    }

    this.renderer.render();
  }

  updateGame(dt) {
    const input = this.inputManager.state;

    // アイテム発射トリガー
    if (input.useItemTrigger && this.localPlayerKart.holdingItem) {
      input.useItemTrigger = false;
      const throwDir = input.isForwardThrow ? 'forward' : 'backward';
      input.isForwardThrow = false;
      const item = this.localPlayerKart.holdingItem;
      item.use(this.localPlayerKart, this, throwDir);
      item.remainingUses = (item.remainingUses || 1) - 1;

      if (item.remainingUses <= 0) {
        this.localPlayerKart.holdingItem = null;
        this.localPlayerKart.removeTrailingMesh(this);
      }
    }

    // 1. 自機物理更新
    this.localPlayerKart.update(dt, input, this.courseTrack.curve, this.currentCourseConfig.trackWidth, this);

    // 2. カメラ追従
    this.followCamera.update(
      dt,
      this.localPlayerKart.isSpinning,
      this.courseTrack.curve,
      this.localPlayerKart.progress
    );

    // 3. 他プレイヤー (AIまたはP2P) 更新
    this.otherPlayers.forEach((player) => {
      if (player.isAI) {
        this.updateAIPlayer(player, dt);
      }
    });

    // 4. 木・岩などコース環境オブジェクトとの衝突判定
    this.checkObstacleCollisions();

    // 4-2. ダッシュボード（加速板）判定
    this.checkDashPanels();

    // 4-3. スター発動中の七色（レインボー）発光エフェクト
    this.updateInvincibleRainbowEffects();

    // 5. ワールド内アイテム更新と当たり判定 & 相殺判定
    this.updateWorldItems(dt);

    // 6. アイテムボックス当たり判定
    this.updateItemBoxes(dt);

    // 7. 順位計算
    const ranking = this.calculateRankings();
    const myRank = ranking.findIndex(k => k === this.localPlayerKart) + 1;

    // 8. HUD更新
    const allKartPositions = [{
      x: this.localPlayerKart.mesh.position.x,
      z: this.localPlayerKart.mesh.position.z,
      isLocal: true
    }];

    this.otherPlayers.forEach(p => {
      allKartPositions.push({
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        isLocal: false,
        color: '#e74c3c'
      });
    });

    this.hud.update({
      position: myRank,
      currentLap: this.localPlayerKart.currentLap,
      totalLaps: this.localPlayerKart.totalLaps,
      speed: this.localPlayerKart.speed,
      holdingItem: this.localPlayerKart.holdingItem,
      isRespawning: this.localPlayerKart.isRespawning,
      respawnTimer: this.localPlayerKart.respawnTimer,
      isWrongWay: this.localPlayerKart.isWrongWay,
      allKartPositions
    }, this.courseTrack.points);

    // 9. P2Pマルチプレイ位置送信
    if (this.p2p.roomId) {
      this.p2p.sendKartState({
        x: this.localPlayerKart.mesh.position.x,
        y: this.localPlayerKart.mesh.position.y,
        z: this.localPlayerKart.mesh.position.z,
        qx: this.localPlayerKart.mesh.quaternion.x,
        qy: this.localPlayerKart.mesh.quaternion.y,
        qz: this.localPlayerKart.mesh.quaternion.z,
        qw: this.localPlayerKart.mesh.quaternion.w,
        speed: this.localPlayerKart.speed,
        lap: this.localPlayerKart.currentLap,
        progress: this.localPlayerKart.progress
      });
    }

    if (this.localPlayerKart.isFinished && !this._finishedNotified) {
      this._finishedNotified = true;
      this.showItemNotification(`GOAL!! あなたの順位は 第${myRank}位 です！`, 5000);
    }
  }

  checkObstacleCollisions() {
    if (!this.courseObstacles || this.courseObstacles.length === 0) return;
    const allKarts = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];

    for (const kart of allKarts) {
      if (!kart || kart.isRespawning) continue;

      for (const obs of this.courseObstacles) {
        const dx = kart.mesh.position.x - obs.position.x;
        const dz = kart.mesh.position.z - obs.position.z;
        const dist = Math.hypot(dx, dz);
        const minDist = obs.radius + 1.2; // 障害物半径 + カート半径

        if (dist < minDist) {
          // 木や岩に衝突！
          // 1. カートを押し出し（めり込み防止）
          const overlap = minDist - dist;
          const pushX = (dx / (dist || 1)) * overlap;
          const pushZ = (dz / (dist || 1)) * overlap;
          kart.mesh.position.x += pushX;
          kart.mesh.position.z += pushZ;

          // 2. 速度大幅減衰 & 反動バウンス
          kart.speed = -kart.speed * 0.35;

          if (kart === this.localPlayerKart && Math.abs(kart.speed) > 4.0) {
            const name = obs.type === 'tire_wall' ? 'タイヤウォール' : (obs.type === 'tree' ? '木' : '岩');
            this.showItemNotification(`${name}に激突！`);
          }
        }
      }
    }
  }

  checkDashPanels() {
    if (!this.courseTrack || !this.courseTrack.dashPanels || this.courseTrack.dashPanels.length === 0) return;
    const allKarts = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];

    for (const kart of allKarts) {
      if (!kart || kart.isRespawning) continue;

      for (const panel of this.courseTrack.dashPanels) {
        const dist = kart.mesh.position.distanceTo(panel.position);
        if (dist < (panel.radius || 6.0)) {
          // ダッシュボードを踏んだ！ 瞬間ダッシュ + 2秒間ブースト
          kart.applyBoost(1.55, 2.0);
          kart.speed = Math.max(kart.speed, kart.maxSpeed * 1.35);

          if (kart === this.localPlayerKart) {
            if (!this._lastDashTime || performance.now() - this._lastDashTime > 1500) {
              this._lastDashTime = performance.now();
              this.showItemNotification('⚡ ダッシュボード通過！急加速！', 1500);
            }
          }
        }
      }
    }
  }

  updateInvincibleRainbowEffects() {
    const allKarts = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];
    const time = performance.now() * 0.008;

    for (const kart of allKarts) {
      if (!kart || !kart.mesh) continue;
      const uData = kart.mesh.userData;
      if (!uData || !uData.bodyMesh) continue;

      if (kart.invincibleTimer > 0) {
        // 七色に高速グラデーション変化
        const hue = (time * 0.7) % 1.0;
        const color = new THREE.Color().setHSL(hue, 1.0, 0.55);

        uData.bodyMesh.material.color = color;
        if (uData.headMesh) uData.headMesh.material.color = color;
        if (uData.wingMesh) uData.wingMesh.material.color = color;
      } else if (uData.defaultColor !== undefined) {
        // 通常色に戻す
        uData.bodyMesh.material.color.setHex(uData.defaultColor);
        if (uData.headMesh) uData.headMesh.material.color.setHex(uData.defaultColor);
        if (uData.wingMesh) uData.wingMesh.material.color.setHex(uData.defaultAccent || uData.defaultColor);
      }
    }
  }

  updateAIPlayer(aiKart, dt) {
    const curve = this.courseTrack.curve;
    const physics = aiKart.physics;
    const mesh = aiKart.mesh;

    const lookAheadT = (physics.progress + 0.04) % 1.0;
    const targetPt = curve.getPointAt(lookAheadT);

    const tangent = curve.getTangentAt(lookAheadT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
    targetPt.addScaledVector(normal, aiKart.aiOffset || 0);

    const dirToTarget = new THREE.Vector3().subVectors(targetPt, mesh.position);
    dirToTarget.y = 0;
    dirToTarget.normalize();

    const kartForward = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    kartForward.y = 0;
    kartForward.normalize();

    const cross = new THREE.Vector3().crossVectors(kartForward, dirToTarget);
    const steer = Math.max(-1, Math.min(1, -cross.y * 3.0));

    const aiInput = {
      steering: steer,
      accelerating: 0.95 * (aiKart.speedMultiplier || 1.0),
      braking: 0,
      drift: false,
      itemHeld: false,
      useItemTrigger: false
    };

    physics.update(dt, aiInput, curve, this.currentCourseConfig.trackWidth, this);
  }

  updateItemBoxes(dt) {
    this.itemBoxes.forEach(box => {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
      } else {
        box.mesh.rotation.x += dt * 1.5;
        box.mesh.rotation.y += dt * 2.5;

        if (box.pos.distanceTo(this.localPlayerKart.mesh.position) < 2.5) {
          box.active = false;
          box.mesh.visible = false;
          box.respawnTimer = 4.0;

          if (!this.localPlayerKart.holdingItem) {
            const ranking = this.calculateRankings();
            const myRank = ranking.findIndex(k => k === this.localPlayerKart) + 1;
            const item = Items.getRandomItem(myRank, 4);
            this.localPlayerKart.holdingItem = item;
            this.showItemNotification(`アイテム獲得: ${item.name}!`);
          }
        }
      }
    });
  }

  updateWorldItems(dt) {
    const karts = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];

    for (let i = this.activeWorldItems.length - 1; i >= 0; i--) {
      const item = this.activeWorldItems[i];
      if (!item.active) {
        this.activeWorldItems.splice(i, 1);
        continue;
      }
      item.update(dt);
    }

    // アイテム同士の相殺判定
    for (let i = 0; i < this.activeWorldItems.length; i++) {
      const a = this.activeWorldItems[i];
      if (!a.active || !a.canBlockShell) continue;

      for (let j = i + 1; j < this.activeWorldItems.length; j++) {
        const b = this.activeWorldItems[j];
        if (!b.active || !b.canBlockShell) continue;

        const dist = a.mesh.position.distanceTo(b.mesh.position);
        if (dist < (a.radius + b.radius)) {
          a.destroy();
          b.destroy();
          this.showItemNotification('アイテム同士が衝突して相殺！');
          break;
        }
      }
    }

    // カートとの当たり判定
    for (const item of this.activeWorldItems) {
      if (!item.active) continue;

      for (const kart of karts) {
        if (!kart) continue;

        // 投擲主自身への当たり判定判定（発射直後や空中飛行中の自爆防止）
        if (item.ownerId === kart.id) {
          if (item.type === 'bobomb' && ((item.ownerGraceTimer && item.ownerGraceTimer > 0) || !item.hasLanded)) {
            continue;
          }
          if (item.type.includes('shell') && (item.lifetime || 0) > 7.4) {
            continue;
          }
        }

        if (kart.trailingItemMesh && item.canBlockShell) {
          const trailDist = item.mesh.position.distanceTo(kart.trailingItemMesh.position);
          if (trailDist < (item.radius + 1.2)) {
            item.destroy();
            kart.holdingItem = null;
            kart.removeTrailingMesh(this);
            if (kart === this.localPlayerKart) {
              this.showItemNotification('お尻のアイテムで甲羅をガードした！');
            }
            continue;
          }
        }

        const dist = item.mesh.position.distanceTo(kart.mesh.position);
        if (dist < (item.radius + 1.2)) {
          item.onHit(kart);
          if (kart === this.localPlayerKart && item.type !== 'dropped_mushroom') {
            this.showItemNotification('アイテムに被弾！スピンアウト！');
          }
          break;
        }
      }
    }
  }

  calculateRankings() {
    const all = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];
    all.sort((a, b) => {
      if (b.currentLap !== a.currentLap) return b.currentLap - a.currentLap;
      return b.progress - a.progress;
    });
    return all;
  }

  findTargetKartAhead(kart) {
    const rankings = this.calculateRankings();
    const myIndex = rankings.findIndex(k => k === kart);
    if (myIndex > 0) {
      return rankings[myIndex - 1];
    }
    return null;
  }

  getTrackHeightAt(pos) {
    if (!this.courseTrack) return 0;
    const t = this.localPlayerKart.findNearestTrackT(this.courseTrack.curve, pos);
    return this.courseTrack.curve.getPointAt(t).y;
  }
}
