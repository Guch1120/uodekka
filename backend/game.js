// backend/game.js
// レースゲーム全体のループ制御、プレイヤー/CPUの初期化、アイテム管理、通信同期
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

    // レース状態
    this.isRunning = false;
    this.currentCourseConfig = null;
    this.courseTrack = null;

    this.localPlayerKart = null;
    this.otherPlayers = new Map(); // id -> { mesh, physics, isAI }
    this.activeWorldItems = [];
    this.itemBoxes = [];

    this.clock = new THREE.Clock();

    this.initUIListeners();

    // ロビーモーダル起動
    this.lobbyModal = new LobbyModal(this.appContainer, this.p2p, (gameConfig) => {
      this.startRace(gameConfig);
    });

    // P2P通信受信イベントの紐付け
    this.setupNetworkEvents();

    // アニメーションループ開始
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initUIListeners() {
    document.getElementById('btn-open-settings').onclick = () => {
      this.settingsModal.show();
    };
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
      }
    };
  }

  showItemNotification(text) {
    this.hud.showNotification(text);
  }

  startRace(config) {
    // 既存シーンクリア
    while (this.scene.children.length > 2) { // AmbientLight, DirLightを残す
      const obj = this.scene.children[this.scene.children.length - 1];
      this.scene.remove(obj);
    }
    this.otherPlayers.clear();
    this.activeWorldItems = [];
    this.itemBoxes = [];
    this._finishedNotified = false;

    // コース読み込み
    this.currentCourseConfig = Courses.getCourse(config.courseId);
    this.renderer.setSkyAndTheme(this.currentCourseConfig.skyColor, this.currentCourseConfig.ambientColor);

    // コース生成
    this.courseTrack = Courses.buildTrack(this.currentCourseConfig);
    this.scene.add(this.courseTrack.group);

    // コース環境（木や岩、星屑）生成
    if (this.currentCourseConfig.createEnvironment) {
      this.scene.add(this.currentCourseConfig.createEnvironment(this.scene));
    }

    // アイテムボックス配置
    this.spawnItemBoxes();

    // 自機カート配置 (グリッド4番手)
    const curve = this.courseTrack.curve;
    const startT = 0.02;
    const p0 = curve.getPointAt(startT);
    const forward = curve.getTangentAt(startT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(forward, up).normalize();

    const localKartMesh = Vehicles.createKartMesh(config.vehicleKey);
    // 自機は右側グリッド
    localKartMesh.position.copy(p0).addScaledVector(normal, 4.0);
    localKartMesh.position.y += 0.4;
    localKartMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);
    this.scene.add(localKartMesh);

    const vehicleConfig = Vehicles.types[config.vehicleKey] || Vehicles.types.standard_red;
    this.localPlayerKart = new KartPhysics(localKartMesh, vehicleConfig, true);
    this.localPlayerKart.totalLaps = this.currentCourseConfig.totalLaps;
    this.localPlayerKart.progress = startT;

    this.followCamera.setTarget(localKartMesh);

    // ソロモードの場合、CPUカートを3体追加 (自機より前のグリッドに整列配置)
    if (config.mode === 'solo') {
      this.spawnAICarts(config.vehicleKey);
    }

    this.isRunning = true;
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

      // 幅広コースに合わせて5個並びで配置
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

    // スタートグリッド配置 (1位, 2位, 3位の順で前方に互い違いに配置)
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
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);
      this.scene.add(mesh);

      const physics = new KartPhysics(mesh, Vehicles.types[vKey], false);
      physics.totalLaps = this.currentCourseConfig.totalLaps;
      physics.progress = t;

      this.otherPlayers.set(`ai_${i}`, {
        id: `ai_${i}`,
        mesh,
        physics,
        isAI: true,
        aiOffset: gridOffsets[i] * 0.7, // コース内側の走行ライン
        speedMultiplier: 0.88 + (i * 0.04) // 絶妙なCPU難易度バランス
      });
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.isRunning && this.localPlayerKart) {
      this.updateGame(dt);
    }

    this.renderer.render();
  }

  updateGame(dt) {
    const input = this.inputManager.state;

    // アイテム使用入力
    if (input.useItem && this.localPlayerKart.holdingItem) {
      this.localPlayerKart.holdingItem.use(this.localPlayerKart, this);
      this.localPlayerKart.holdingItem = null;
    }

    // 1. 自機物理更新
    this.localPlayerKart.update(dt, input, this.courseTrack.curve, this.currentCourseConfig.trackWidth);

    // 2. カメラ追従
    this.followCamera.update(dt);

    // 3. 他プレイヤー (AIまたはP2P) 更新
    this.otherPlayers.forEach((player) => {
      if (player.isAI) {
        this.updateAIPlayer(player, dt);
      }
    });

    // 4. ワールド内アイテム（バナナ、コウラ）の更新と当たり判定
    this.updateWorldItems(dt);

    // 5. アイテムボックスの当たり判定 & 再生タイマー
    this.updateItemBoxes(dt);

    // 6. 順位計算
    const ranking = this.calculateRankings();
    const myRank = ranking.findIndex(k => k === this.localPlayerKart) + 1;

    // 7. HUD更新
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
      allKartPositions
    }, this.courseTrack.points);

    // 8. P2Pマルチプレイ位置送信 (毎フレーム)
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

    // ゴール判定
    if (this.localPlayerKart.isFinished && !this._finishedNotified) {
      this._finishedNotified = true;
      this.showItemNotification(`GOAL!! あなたの順位は 第${myRank}位 です！`, 5000);
    }
  }

  updateAIPlayer(aiKart, dt) {
    const curve = this.courseTrack.curve;
    const physics = aiKart.physics;
    const mesh = aiKart.mesh;

    // 現在の進捗位置より少し前方をナビゲート目標にする
    const lookAheadT = (physics.progress + 0.04) % 1.0;
    const targetPt = curve.getPointAt(lookAheadT);

    // コース左右オフセット
    const tangent = curve.getTangentAt(lookAheadT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
    targetPt.addScaledVector(normal, aiKart.aiOffset || 0);

    // 目標地点への方向ベクトル
    const dirToTarget = new THREE.Vector3().subVectors(targetPt, mesh.position);
    dirToTarget.y = 0;
    dirToTarget.normalize();

    // カートの進行方向 (-Z)
    const kartForward = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    kartForward.y = 0;
    kartForward.normalize();

    // 外積で左右のステアリング角を計算
    const cross = new THREE.Vector3().crossVectors(kartForward, dirToTarget);
    const steer = Math.max(-1, Math.min(1, -cross.y * 3.0));

    const aiInput = {
      steering: steer,
      accelerating: 0.95 * (aiKart.speedMultiplier || 1.0),
      braking: 0,
      drift: false
    };

    physics.update(dt, aiInput, curve, this.currentCourseConfig.trackWidth);
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

        // 自機との接触判定
        if (box.pos.distanceTo(this.localPlayerKart.mesh.position) < 2.5) {
          box.active = false;
          box.mesh.visible = false;
          box.respawnTimer = 4.0;

          if (!this.localPlayerKart.holdingItem) {
            const item = Items.getRandomItem(1, 4);
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

      for (const kart of karts) {
        if (!kart) continue;
        if (item.ownerId === kart.id && item.type !== 'banana' && (item.lifetime || 0) > 7.5) {
          continue;
        }

        const dist = item.mesh.position.distanceTo(kart.mesh.position);
        if (dist < (item.radius + 1.2)) {
          item.onHit(kart);
          if (kart === this.localPlayerKart) {
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
