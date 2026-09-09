// backend/game.js
// レースゲーム全体のループ制御、プレイヤー/CPUの初期化、障害物当たり判定、通信同期
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GameRenderer } from './engine/renderer.js';
import { KartPhysics } from './engine/physics.js';
import { FollowCamera } from './engine/camera.js';
import { InputManager } from './input/input_manager.js';
import { WebSocketManager } from './network/websocket_manager.js';

import { Vehicles } from '../frontend/vehicles/vehicles.js';
import { Courses } from '../frontend/courses/index.js';
import { Items } from '../frontend/items/items.js';
import { HUD } from '../frontend/ui/hud.js';
import { SettingsModal } from '../frontend/ui/settings_modal.js';
import { LobbyModal } from '../frontend/ui/lobby_modal.js';
import { PauseModal } from '../frontend/ui/pause_modal.js';
import { EditorModal } from '../frontend/ui/editor_modal.js';
import { ResultModal } from '../frontend/ui/result_modal.js';
import { CourseKnowledgeBase } from './ai/learning_ai.js';
import { CPUDriver, CPU_ROSTER } from './ai/cpu_driver.js';

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

    // ゲームサーバー経由のWebSocket通信管理
    this.p2p = new WebSocketManager();

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
    this.knowledgeBase = null;
    this._lastPlayerLap = 1;

    this.clock = new THREE.Clock();

    this.initUIListeners();

    // コースエディタモーダル
    this.editorModal = new EditorModal(this.appContainer, (customCourseId) => {
      this.lobbyModal.hide();
      this.startRace({
        mode: 'solo',
        courseId: customCourseId,
        vehicleKey: this.lobbyModal.vehicleKey,
        playerName: this.lobbyModal.playerName,
        isHost: true
      });
    });

    // ロビーモーダル起動
    this.lobbyModal = new LobbyModal(this.appContainer, this.p2p, (gameConfig) => {
      this.startRace(gameConfig);
    }, this.inputManager);
    this.lobbyModal.onSessionEnded = () => { if (this.isRunning) this.quitRace(); };
    this.lobbyModal.onOpenEditor = () => {
      this.editorModal.show();
    };

    this.setupNetworkEvents();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initUIListeners() {
    document.getElementById('btn-open-settings').onclick = () => {
      this.inputManager.resetState();
      this.settingsModal.show();
    };

    const btnPause = document.getElementById('btn-open-pause');
    if (btnPause) {
      btnPause.onclick = () => {
        this.openPauseMenu();
      };
    }

    // Escキーでの一時中断・再開
    this.inputManager.onEscape = () => {
      if (!this.isRunning) return;
      if (this.isPaused) {
        this.resumeRace();
        this.pauseModal.hide();
      } else {
        this.openPauseMenu();
      }
    };

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
    this.inputManager.resetState();
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
    if (this.activeResultModal) {
      this.activeResultModal.destroy();
      this.activeResultModal = null;
    }
    if (this.currentGameConfig) {
      this.startRace(this.currentGameConfig);
    }
  }

  selectOtherCourse() {
    this.quitRace();
    if (this.lobbyModal) {
      this.lobbyModal.showScreen('solo');
    }
  }

  quitRace() {
    this.isPaused = false;
    this.isRunning = false;
    if (this.activeResultModal) {
      this.activeResultModal.destroy();
      this.activeResultModal = null;
    }

    // HUDおよび操作UIを非表示
    if (this.hud) this.hud.hide();
    if (this.inputManager) this.inputManager.hideControls();

    // マルチプレイ接続中なら切断
    this.p2p.leaveRoom();
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
    this.p2p.onPlayerLeft = (peerId) => {
      const player = this.otherPlayers.get(peerId);
      if (player) this.scene.remove(player.mesh);
      this.otherPlayers.delete(peerId);
    };
    this.p2p.onPeerStateReceived = (peerId, state) => {
      if (!this.isRunning) return;
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

    this.p2p.onCpuStatesReceived = (states) => {
      if (!this.isRunning || !Array.isArray(states)) return;
      states.forEach(state => {
        let aiKart = this.otherPlayers.get(state.id);
        if (!aiKart) {
          const vKey = state.vehicleKey || 'standard_red';
          const mesh = Vehicles.createKartMesh(vKey, state.color, state.accent);
          this.scene.add(mesh);
          const physics = new KartPhysics(mesh, Vehicles.types[vKey] || Vehicles.types.standard_red, false);
          aiKart = { id: state.id, name: state.name, mesh, physics, isAI: false, isHostControlled: false, colorHex: state.colorHex };
          this.otherPlayers.set(state.id, aiKart);
        }
        if (!aiKart.isHostControlled) {
          aiKart.mesh.position.set(state.x, state.y, state.z);
          aiKart.mesh.quaternion.set(state.qx, state.qy, state.qz, state.qw);
          aiKart.physics.currentLap = state.lap;
          aiKart.physics.progress = state.progress;
          aiKart.physics.speed = state.speed;
        }
      });
    };
  }

  showItemNotification(text, durationMs = 2000) {
    this.hud.showNotification(text, durationMs);
  }

  getGridTransform(curve, gridIndex) {
    const startT = 0.05;
    const row = Math.floor(gridIndex / 2); // 0 to 5
    const col = gridIndex % 2; // 0 = left (+3.4m), 1 = right (-3.4m)
    const rowProgress = (startT - row * 0.0055 + 1.0) % 1.0;

    const p = curve.getPointAt(rowProgress);
    const forward = curve.getTangentAt(rowProgress).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(forward, up).normalize();

    const lateralOffset = (col === 0) ? 3.4 : -3.4;
    const pos = p.clone().addScaledVector(normal, lateralOffset);
    pos.y += 0.4;
    const yaw = Math.atan2(-forward.x, -forward.z);

    return { pos, yaw, progress: rowProgress };
  }

  startRace(config) {
    this.inputManager.resetState();
    if (this.activeResultModal) {
      this.activeResultModal.destroy();
      this.activeResultModal = null;
    }
    this.raceStartTime = performance.now();
    this.lastLapStartTime = this.raceStartTime;
    this.lapTimes = [];
    this.jumpRamps = [];

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
    if (this.courseTrack.jumpRamps) {
      this.jumpRamps = [...this.courseTrack.jumpRamps];
    }

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

    // プレイヤー走行学習用知識ベースの初期化
    this.knowledgeBase = new CourseKnowledgeBase(config.courseId, this.courseTrack.curve, this.currentCourseConfig.trackWidth);
    this._lastPlayerLap = 1;

    const curve = this.courseTrack.curve;
    const localKartMesh = Vehicles.createKartMesh(config.vehicleKey);
    const gridIndex = config.mode === 'solo' ? 0 : Math.max(0, this.p2p.members.findIndex(member => member.id === this.p2p.myPeerId));
    const gridInfo = this.getGridTransform(curve, gridIndex);

    localKartMesh.position.copy(gridInfo.pos);
    localKartMesh.rotation.set(0, gridInfo.yaw, 0, 'YXZ');
    this.scene.add(localKartMesh);

    const vehicleConfig = Vehicles.types[config.vehicleKey] || Vehicles.types.standard_red;
    this.localPlayerKart = new KartPhysics(localKartMesh, vehicleConfig, true);
    this.localPlayerKart.alignToTrack(curve, gridInfo.progress);
    this.localPlayerKart.totalLaps = this.currentCourseConfig.totalLaps;
    this.localPlayerKart.progress = gridInfo.progress;
    this.localPlayerKart.lastSafeT = gridInfo.progress;

    this.followCamera.setTarget(localKartMesh);

    // 12人レースの編成
    if (config.mode === 'solo') {
      // ソロ：プレイヤー1人 ＋ CPU 11台 ＝ 合計12台
      this.spawnAICarts(config.vehicleKey, 11, 1);
    } else if (config.mode === 'multi_host') {
      // マルチホスト：参加者M人 ＋ 不足(12 - M)台のCPU ＝ 合計12台
      const memberCount = this.p2p.members.length;
      const neededCpu = Math.max(0, 12 - memberCount);
      if (neededCpu > 0) {
        this.spawnAICarts(config.vehicleKey, neededCpu, memberCount);
      }
    } else if (config.mode === 'multi_guest') {
      // マルチゲスト：ホストから送られたCPUカートリストを配置
      if (config.aiRacers && config.aiRacers.length > 0) {
        config.aiRacers.forEach(bot => {
          const grid = this.getGridTransform(curve, bot.gridIndex);
          const mesh = Vehicles.createKartMesh(bot.vehicleKey, bot.color, bot.accent);
          mesh.position.copy(grid.pos);
          mesh.rotation.set(0, grid.yaw, 0, 'YXZ');
          this.scene.add(mesh);
          const physics = new KartPhysics(mesh, Vehicles.types[bot.vehicleKey] || Vehicles.types.standard_red, false);
          physics.alignToTrack(curve, grid.progress);
          physics.totalLaps = this.currentCourseConfig.totalLaps;
          physics.progress = grid.progress;
          this.otherPlayers.set(bot.id, {
            id: bot.id,
            name: bot.name,
            mesh,
            physics,
            isAI: false,
            isHostControlled: false,
            colorHex: '#' + (bot.color || 0xe74c3c).toString(16).padStart(6, '0')
          });
        });
      }
    }

    this.currentGameConfig = config;
    this.isPaused = false;
    this.isRunning = true;

    // レース開始時にHUDとタッチコントロールを表示
    if (this.hud) this.hud.show();
    if (this.inputManager) this.inputManager.showControls();

    const aiLevel = this.knowledgeBase ? this.knowledgeBase.learningLevel : 1;
    this.showItemNotification(`レーススタート！ 12人対戦 GO! (CPU学習Lv.${aiLevel})`, 3000);
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

  spawnAICarts(playerVehicleKey, count = 11, startGridIndex = 1) {
    const curve = this.courseTrack.curve;

    for (let i = 0; i < count; i++) {
      const gridIndex = startGridIndex + i;
      const bot = CPU_ROSTER[i % CPU_ROSTER.length];
      const vKey = bot.vehicleKey;
      const mesh = Vehicles.createKartMesh(vKey, bot.color, bot.accent);

      const grid = this.getGridTransform(curve, gridIndex);
      mesh.position.copy(grid.pos);
      mesh.rotation.set(0, grid.yaw, 0, 'YXZ');
      this.scene.add(mesh);

      const physics = new KartPhysics(mesh, Vehicles.types[vKey], false);
      physics.alignToTrack(curve, grid.progress);
      physics.totalLaps = this.currentCourseConfig.totalLaps;
      physics.progress = grid.progress;
      physics.lastSafeT = grid.progress;

      this.otherPlayers.set(bot.id, {
        id: bot.id,
        name: bot.name,
        mesh,
        physics,
        isAI: true,
        isHostControlled: true,
        personality: bot,
        aiOffset: bot.offsetBias,
        speedMultiplier: bot.speedScale,
        colorHex: '#' + bot.color.toString(16).padStart(6, '0')
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
    const useItem = input.useItemTrigger;
    input.useItemTrigger = false;
    if (useItem && this.localPlayerKart.holdingItem) {
      const throwDir = input.isForwardThrow ? 'forward' : 'backward';
      input.isForwardThrow = false;
      const item = this.localPlayerKart.holdingItem;
      item.use(this.localPlayerKart, this, throwDir);
      if (this.p2p.roomId && (item.id === 'banana' || item.id === 'lightning')) {
        this.p2p.sendItemEvent({
          itemType: item.id,
          ownerId: this.p2p.myPeerId,
          pos: [this.localPlayerKart.mesh.position.x, this.localPlayerKart.mesh.position.y, this.localPlayerKart.mesh.position.z],
          rot: [this.localPlayerKart.mesh.quaternion.x, this.localPlayerKart.mesh.quaternion.y, this.localPlayerKart.mesh.quaternion.z, this.localPlayerKart.mesh.quaternion.w]
        });
      }
      item.remainingUses = (item.remainingUses || 1) - 1;

      if (item.remainingUses <= 0) {
        this.localPlayerKart.holdingItem = null;
        this.localPlayerKart.removeTrailingMesh(this);
      }
    }

    // 1. 自機物理更新
    this.localPlayerKart.update(dt, input, this.courseTrack.curve, this.currentCourseConfig.trackWidth, this);

    // プレイヤーの走行データサンプリングとリアルタイム学習
    if (this.knowledgeBase && this.localPlayerKart) {
      this.knowledgeBase.recordPlayerSample(this.localPlayerKart, this.courseTrack.curve);
      if (this.localPlayerKart.currentLap > this._lastPlayerLap) {
        // ラップタイム計測
        const lapTime = performance.now() - this.lastLapStartTime;
        this.lapTimes.push(lapTime);
        this.lastLapStartTime = performance.now();

        this._lastPlayerLap = this.localPlayerKart.currentLap;
        this.knowledgeBase.commitLap();
        const level = this.knowledgeBase.learningLevel;
        this.showItemNotification(`🧠 プレイヤーの走りを学習！ (CPU学習Lv.${level})`, 2200);
      }
    }

    // 2. カメラ追従
    this.followCamera.update(
      dt,
      this.localPlayerKart.isSpinning,
      this.courseTrack.curve,
      this.localPlayerKart.progress
    );

    // 3. 他プレイヤー (AIまたはWebSocket) 更新
    this.otherPlayers.forEach((player) => {
      if (player.isAI) {
        this.updateAIPlayer(player, dt);
      }
    });

    // 4. 木・岩などコース環境オブジェクトとの衝突判定
    this.checkObstacleCollisions();

    // 4-2. ダッシュボード（加速板）判定
    this.checkDashPanels();

    // 4-2-2. ジャンプ台（通常・滑空）判定
    this.checkJumpRamps();

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
      isLocal: true,
      color: '#38bdf8'
    }];

    this.otherPlayers.forEach(p => {
      allKartPositions.push({
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        isLocal: false,
        color: p.colorHex || '#e74c3c'
      });
    });

    this.hud.update({
      position: myRank,
      currentLap: this.localPlayerKart.currentLap,
      totalLaps: this.localPlayerKart.totalLaps,
      speed: this.localPlayerKart.speed,
      boostTimer: this.localPlayerKart.boostTimer,
      holdingItem: this.localPlayerKart.holdingItem,
      isRespawning: this.localPlayerKart.isRespawning,
      respawnTimer: this.localPlayerKart.respawnTimer,
      isWrongWay: this.localPlayerKart.isWrongWay,
      allKartPositions
    }, this.courseTrack.points);

    // 9. マルチプレイ位置送信（自機 + ホスト主導のCPU位置）
    if (this.p2p.roomId) {
      this.p2p.sendKartState({
        vehicleKey: this.currentGameConfig.vehicleKey,
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

      if (this.p2p.isHost) {
        const cpuStates = [];
        this.otherPlayers.forEach(p => {
          if (p.isAI) {
            cpuStates.push({
              id: p.id,
              name: p.name,
              vehicleKey: p.personality?.vehicleKey || 'standard_red',
              color: p.personality?.color,
              accent: p.personality?.accent,
              colorHex: p.colorHex,
              x: p.mesh.position.x,
              y: p.mesh.position.y,
              z: p.mesh.position.z,
              qx: p.mesh.quaternion.x,
              qy: p.mesh.quaternion.y,
              qz: p.mesh.quaternion.z,
              qw: p.mesh.quaternion.w,
              speed: p.physics.speed,
              lap: p.physics.currentLap,
              progress: p.physics.progress
            });
          }
        });
        if (cpuStates.length > 0) {
          this.p2p.sendCpuStates(cpuStates);
        }
      }
    }

    if (this.localPlayerKart.isFinished && !this._finishedNotified) {
      this._finishedNotified = true;
      if (this.knowledgeBase) {
        this.knowledgeBase.commitLap();
      }

      // 最終ラップタイムとトータルタイムの計算
      if (this.lapTimes.length < this.localPlayerKart.totalLaps) {
        const finalLapTime = performance.now() - this.lastLapStartTime;
        this.lapTimes.push(finalLapTime);
      }
      const totalTime = performance.now() - this.raceStartTime;

      // 12人の着順一覧を生成
      const racersList = ranking.map((kart, idx) => {
        const isLocal = kart === this.localPlayerKart;
        let name = isLocal ? (localStorage.getItem('kart_player_name') || 'あなた') : 'CPU';
        let colorHex = isLocal ? '#38bdf8' : '#e74c3c';
        let rTime = 0;
        if (isLocal) {
          rTime = totalTime;
        } else {
          for (const [id, p] of this.otherPlayers.entries()) {
            if (p.physics === kart) {
              name = p.name || 'CPU';
              colorHex = p.colorHex || '#e74c3c';
              break;
            }
          }
          if (kart.finishTime && this.raceStartTime) {
            rTime = kart.finishTime - this.raceStartTime;
          } else {
            rTime = totalTime + (idx + 1 - myRank) * 2200;
          }
        }
        return {
          rank: idx + 1,
          name: name,
          isLocal: isLocal,
          colorHex: colorHex,
          totalTime: Math.max(8000, rTime)
        };
      });

      this.showItemNotification(`GOAL!! あなたの順位は 第${myRank}位 です！`, 3500);

      setTimeout(() => {
        if (!this.isRunning || this.activeResultModal) return;
        this.activeResultModal = new ResultModal(this.appContainer, {
          rank: myRank,
          totalTime: totalTime,
          lapTimes: [...this.lapTimes],
          courseName: this.currentCourseConfig.name,
          racers: racersList
        }, {
          onHome: () => this.quitRace(),
          onChangeCourse: () => this.selectOtherCourse(),
          onRetry: () => this.restartRace()
        });
        this.activeResultModal.show();
      }, 1200);
    }
  }

  checkObstacleCollisions() {
    if (!this.courseObstacles || this.courseObstacles.length === 0) return;
    const allKarts = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];

    for (const kart of allKarts) {
      if (!kart || kart.isRespawning) continue;

      for (const obs of this.courseObstacles) {
        if (obs.type === 'tire_wall_segment') {
          // --- 連続体タイヤウォール（線分セグメント）の衝突判定 ---
          const abX = obs.p2.x - obs.p1.x;
          const abY = obs.p2.y - obs.p1.y;
          const abZ = obs.p2.z - obs.p1.z;
          const abLenSq = abX * abX + abY * abY + abZ * abZ;
          if (abLenSq < 0.0001) continue;

          // カート位置から線分への最短射影パラメータ u
          const acX = kart.mesh.position.x - obs.p1.x;
          const acY = kart.mesh.position.y - obs.p1.y;
          const acZ = kart.mesh.position.z - obs.p1.z;
          let u = (acX * abX + acY * abY + acZ * abZ) / abLenSq;
          u = Math.max(0, Math.min(1, u));

          const qX = obs.p1.x + u * abX;
          const qY = obs.p1.y + u * abY;
          const qZ = obs.p1.z + u * abZ;

          // 高さ（Y座標）の判定：立体交差での上下誤衝突防止
          const dy = kart.mesh.position.y - qY;
          if (Math.abs(dy) > 1.6) continue;

          // XZ平面上の最短距離
          const dx = kart.mesh.position.x - qX;
          const dz = kart.mesh.position.z - qZ;
          const dist = Math.hypot(dx, dz);
          const minDist = (obs.radius || 1.4) + 1.2; // 壁厚み + カート半径 (約2.6m)

          if (dist < minDist) {
            // 1. 壁面法線方向への滑らかな押し出し（めり込み防止＋マージン）
            const overlap = (minDist - dist) + 0.05;
            let pushX, pushZ;
            if (dist > 0.01) {
              pushX = (dx / dist) * overlap;
              pushZ = (dz / dist) * overlap;
            } else {
              pushX = (obs.inwardNormal ? obs.inwardNormal.x : 1) * overlap;
              pushZ = (obs.inwardNormal ? obs.inwardNormal.z : 0) * overlap;
            }
            kart.mesh.position.x += pushX;
            kart.mesh.position.z += pushZ;

            // 2. 車体向き（ヨー角）をレース進行方向・脱出方向へ補正
            // 壁の進行方向（tangent）およびコース内側向き（inwardNormal）から脱出角度を算出
            const inNorm = obs.inwardNormal || { x: 0, z: 0 };
            const escapeX = obs.tangent.x * 0.85 + inNorm.x * 0.25;
            const escapeZ = obs.tangent.z * 0.85 + inNorm.z * 0.25;
            const targetYaw = Math.atan2(-escapeX, -escapeZ);
            kart.mesh.rotation.set(0, targetYaw, 0, 'YXZ');
            kart.mesh.quaternion.setFromEuler(kart.mesh.rotation);

            // 3. 速度制御：壁に沿って前進加速・即時復帰できるよう壁スライド摩擦を適用
            if (kart.speed > 0) {
              kart.speed = Math.max(3.5, kart.speed * 0.8);
            } else {
              kart.speed = 0;
            }

            if (kart === this.localPlayerKart && (!this._lastWallHitTime || performance.now() - this._lastWallHitTime > 1200)) {
              this._lastWallHitTime = performance.now();
              this.showItemNotification('タイヤウォールに接触！');
            }
          }
        } else {
          // --- 木・岩など通常の点障害物の衝突判定 ---
          const dy = kart.mesh.position.y - obs.position.y;
          let maxDyUpper = 1.8;
          let maxDyLower = 1.8;
          if (obs.type === 'tire_wall') {
            maxDyUpper = 1.6;
            maxDyLower = 1.6;
          } else if (obs.type === 'tree') {
            maxDyUpper = 5.5; // 幹の高さ
            maxDyLower = 1.5;
          } else if (obs.type === 'rock') {
            maxDyUpper = 2.2;
            maxDyLower = 2.2;
          } else if (obs.height) {
            maxDyUpper = obs.height;
            maxDyLower = obs.height;
          }

          if (dy > maxDyUpper || dy < -maxDyLower) {
            continue;
          }

          const dx = kart.mesh.position.x - obs.position.x;
          const dz = kart.mesh.position.z - obs.position.z;
          const dist = Math.hypot(dx, dz);
          const minDist = obs.radius + 1.2; // 障害物半径 + カート半径

          if (dist < minDist) {
            const overlap = minDist - dist;
            const pushX = (dx / (dist || 1)) * overlap;
            const pushZ = (dz / (dist || 1)) * overlap;
            kart.mesh.position.x += pushX;
            kart.mesh.position.z += pushZ;

            if (obs.type === 'tire_wall') {
              // タイヤウォール点コライダーの場合も進行方向へ補正
              if (obs.tangent) {
                const inNorm = obs.inwardNormal || { x: 0, z: 0 };
                const escapeX = obs.tangent.x * 0.85 + inNorm.x * 0.25;
                const escapeZ = obs.tangent.z * 0.85 + inNorm.z * 0.25;
                const targetYaw = Math.atan2(-escapeX, -escapeZ);
                kart.mesh.rotation.set(0, targetYaw, 0, 'YXZ');
                kart.mesh.quaternion.setFromEuler(kart.mesh.rotation);
              }
              kart.speed = Math.max(0, kart.speed * 0.25);
            } else {
              // 木や岩に衝突時は反動バウンス
              kart.speed = -kart.speed * 0.35;
            }

            if (kart === this.localPlayerKart && Math.abs(kart.speed) > 3.0) {
              const name = obs.type === 'tire_wall' ? 'タイヤウォール' : (obs.type === 'tree' ? '木' : '岩');
              this.showItemNotification(`${name}に激突！`);
            }
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
        if (Math.abs(kart.mesh.position.y - panel.position.y) > 2.5) continue;
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

  checkJumpRamps() {
    if (!this.jumpRamps || this.jumpRamps.length === 0) return;
    const allKarts = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];

    for (const kart of allKarts) {
      if (!kart || kart.isRespawning) continue;
      // 既に跳躍直後なら連続発動を防ぐ
      if (kart.isAirborne && kart.airTime < 0.3) continue;

      for (const ramp of this.jumpRamps) {
        if (Math.abs(kart.mesh.position.y - ramp.position.y) > 6.0) continue;
        const dx = kart.mesh.position.x - ramp.position.x;
        const dz = kart.mesh.position.z - ramp.position.z;
        const distSq = dx * dx + dz * dz;
        const triggerRadius = (ramp.radius || 15.0);
        if (distSq < triggerRadius * triggerRadius) {
          if (ramp.type === 'glider') {
            kart.triggerGlider(26.0, 1.8, 4.5, ramp);
            if (kart === this.localPlayerKart) {
              this.showItemNotification('🪂 グライダー展開！大空を大滑空！', 2000);
            }
          } else {
            kart.triggerJump(16.0, 1.5, 2.0, ramp);
            if (kart === this.localPlayerKart) {
              this.showItemNotification('🚀 大ジャンプ！', 1500);
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
    CPUDriver.stepAI(aiKart, dt, this.courseTrack, this.currentCourseConfig, this.knowledgeBase, this);
  }

  updateItemBoxes(dt) {
    const allKarts = [this.localPlayerKart, ...Array.from(this.otherPlayers.values()).map(p => p.physics)];
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

        for (const kart of allKarts) {
          if (!kart || kart.isRespawning) continue;
          if (box.pos.distanceTo(kart.mesh.position) < 2.5) {
            box.active = false;
            box.mesh.visible = false;
            box.respawnTimer = 4.0;

            if (!kart.holdingItem) {
              const ranking = this.calculateRankings();
              const rank = ranking.findIndex(k => k === kart) + 1;
              const item = Items.getRandomItem(rank, 12);
              kart.holdingItem = item;
              if (kart === this.localPlayerKart) {
                this.showItemNotification(`アイテム獲得: ${item.name}!`);
              }
            }
            break;
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
