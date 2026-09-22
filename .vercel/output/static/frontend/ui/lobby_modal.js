import { Vehicles, SkillsManager } from '../vehicles/vehicles.js';
import { Courses } from '../courses/index.js';
import { normalizeRoomId } from '../../backend/network/room_id.js';
import { GaragePreview, courseArt, deriveCourseTags } from './lobby_preview.js';
import { CPU_ROSTER } from '../../backend/ai/cpu_driver.js';
import { UpdateModal } from './update_modal.js';
import { FeedbackModal } from './feedback_modal.js?v=20260922-feedback-2';
import { AudioManager } from '../audio/audio_manager.js';
import { getVehicleMissions, NumericBuffTable, CPU_MISSION_MIN_LEVEL } from '../../backend/missions/mission_definitions.js';
import { drawMission } from '../../backend/missions/mission_engine.js';
import { readStoredLearningLevel } from '../../backend/ai/learning_ai.js';

const MISSION_STAT_LABEL = { acceleration: '加速度', topSpeed: '最高速度', miniTurboDuration: 'ミニターボ持続時間' };

const arrow = (id, direction, label) => `<button id="${id}" class="garage-arrow" aria-label="${label}">${direction === 'prev' ? '◀' : '▶'}</button>`;
const STAT_ROWS_HTML = [['topSpeed', 'スピード', 50], ['acceleration', '加速', 35], ['weight', '重さ', 1.5]].map(([key, label, max]) => `<label class="garage-stat"><span>${label}</span><meter data-stat="${key}" min="0" max="${max}" aria-label="${label}"></meter><span data-stat-value="${key}" class="garage-stat-value"></span></label>`).join('');
const statRows = () => `<div class="garage-stat-list">${STAT_ROWS_HTML}</div>`;
const stats = () => `<section class="garage-specs"><div class="garage-eyebrow">PARAMETERS</div>${statRows()}</section>`;

export class LobbyModal {
  constructor(container, p2pManager, onStartGame, inputManager = null) {
    this.container = container;
    this.p2pManager = p2pManager;
    this.onStartGame = onStartGame;
    this.inputManager = inputManager;
    this.vehicleKeys = Object.keys(Vehicles.types);
    this.vehicleIndex = Math.max(0, this.vehicleKeys.indexOf(localStorage.getItem('kart_vehicle')));
    this.courseIndex = 0;
    this.confirmedCourse = null;
    this.screen = 'home';
    this.detailTab = 'parameters';
    this.menuExpanded = false;
    this.busy = false;
    this.connectionAttempt = 0;
    this.starting = false;
    this.init();
  }

  get vehicleKey() { return this.vehicleKeys[this.vehicleIndex]; }
  get playerName() { return this.el('#player-name').value.trim().slice(0, 20) || 'プレイヤー'; }
  el(selector) { return this.modalEl.querySelector(selector); }

  init() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'lobby-modal';
    this.modalEl.className = 'garage';
    this.modalEl.innerHTML = `
      <div class="garage-shell">
        <div id="garage-toast" class="garage-toast hidden" role="status" aria-live="polite"></div>
        <header class="garage-header">
          <div class="garage-header-actions">
            <div class="garage-coin-badge" id="lobby-coin-display" title="コースで集めた累計所持コイン">
              🪙 <strong id="lobby-coin-count">0</strong> <small>コイン</small>
            </div>
            <button id="garage-back" class="garage-subtle" hidden>← ホームへ</button>
          </div>
        </header>
        <main>
          <section class="garage-screen garage-home" data-screen="home">
            <div class="garage-machine-panel">
              <div class="garage-section-heading"><div><span class="garage-eyebrow">01 / SELECT YOUR MACHINE</span><h1>相棒を選ぼう。</h1></div><label class="garage-player-label">プレイヤー名<input id="player-name" maxlength="20" placeholder="名前を入力" autocomplete="nickname"></label></div>
              <div class="garage-showroom">
                <div class="garage-showroom-top"><span class="garage-chip" id="vehicle-category"></span><span id="vehicle-counter" class="garage-counter"></span></div>
                <div class="garage-vehicle-stage" id="garage-home-vehicle-stage"><div id="garage-vehicle-preview"></div>${arrow('vehicle-prev', 'prev', '前の車体')}${arrow('vehicle-next', '次の車体')}</div>
                <div class="garage-vehicle-caption"><div><span class="garage-eyebrow">YOUR MACHINE</span><h2 class="vehicle-name" aria-live="polite"></h2></div><div id="vehicle-dots" class="garage-dots" aria-hidden="true"></div></div>
              </div>
              <div class="garage-home-menu-wrap">
                <button type="button" id="garage-menu-toggle" class="garage-menu-toggle" aria-expanded="false" aria-controls="garage-home-menu">メニュー</button>
                <nav id="garage-home-menu" class="garage-home-menu" aria-label="ホームメニュー">
                  <button type="button" data-home-action="vehicle-detail">車体詳細 <span>↗</span></button>
                  <button type="button" data-home-action="editor">コースを作る <span>↗</span></button>
                  <button type="button" data-home-action="updates">お知らせ <span>↗</span></button>
                  <button type="button" data-home-action="feedback">ご意見・ご要望 <span>↗</span></button>
                  <button type="button" data-home-action="settings">設定 <span>↗</span></button>
                </nav>
              </div>
            </div>
            <div class="garage-mode-panel"><div class="garage-mode-heading"><span class="garage-eyebrow">02 / CHOOSE YOUR RACE</span><h2>さあ、走り出そう。</h2></div>
              <button id="tab-solo" class="garage-mode garage-mode-solo"><span class="garage-mode-icon">🏁</span><span><small>SOLO RACE</small><strong>ソロゲーム</strong><span class="garage-mode-description">CPUと競う、自分だけのレース。</span></span><span class="garage-mode-arrow">↗</span><span class="garage-mode-tag">CPU 対戦</span></button>
              <section class="garage-mode garage-mode-multi"><span class="garage-mode-icon">👥</span><div><small>MULTIPLAYER</small><h2>マルチゲーム</h2><p>ルームに集まって、友だちと対戦。</p></div><div class="garage-multi-actions"><button id="tab-create">ホスト <span>ルームを作成 ↗</span></button><button id="tab-join">ゲスト <span>ルームに参加 ↗</span></button></div></section>
            </div>
          </section>
          <section class="garage-screen garage-vehicle-detail" data-screen="vehicle-detail" hidden>
            <div class="garage-detail-showcase">
              <div class="garage-showroom garage-detail-showroom">
                <div class="garage-showroom-top"><span class="garage-chip" id="detail-vehicle-category"></span><span id="detail-vehicle-counter" class="garage-counter"></span></div>
                <div class="garage-vehicle-stage" id="garage-detail-vehicle-stage">${arrow('detail-vehicle-prev', 'prev', '前の車体')}${arrow('detail-vehicle-next', 'next', '次の車体')}</div>
                <div class="garage-vehicle-caption"><div><span class="garage-eyebrow">YOUR MACHINE</span><h2 class="vehicle-name" aria-live="polite"></h2><p class="vehicle-description"></p></div><div id="detail-vehicle-dots" class="garage-dots" aria-hidden="true"></div></div>
              </div>
            </div>
            <div class="garage-detail-panel">
              <div class="garage-detail-heading"><span class="garage-eyebrow">MACHINE PROFILE</span><h1>車体詳細</h1></div>
              <div class="garage-detail-tabs" role="tablist" aria-label="車体詳細の項目">
                <button type="button" role="tab" data-detail-tab="parameters" aria-selected="true">パラメータ</button>
                <button type="button" role="tab" data-detail-tab="skill" aria-selected="false">固有スキル</button>
                <button type="button" role="tab" data-detail-tab="missions" aria-selected="false">ミッション</button>
              </div>
              <div class="garage-detail-content">
                <section class="garage-detail-section" data-detail-section="parameters" role="tabpanel">${stats()}</section>
                <section class="garage-detail-section" data-detail-section="skill" role="tabpanel" hidden>
                  <div class="garage-detail-card garage-skill-detail-card"><div class="garage-skill-head"><span class="garage-skill-badge">固有スキル</span><strong id="detail-skill-title" class="garage-skill-title"></strong><span id="detail-skill-status" class="garage-skill-status"></span></div><p id="detail-skill-desc" class="garage-skill-desc"></p><button type="button" id="btn-unlock-skill" class="garage-skill-unlock-btn"></button></div>
                </section>
                <section class="garage-detail-section" data-detail-section="missions" role="tabpanel" hidden><div id="detail-missions" class="garage-mission-detail"></div></section>
              </div>
            </div>
          </section>
          <section class="garage-screen garage-setup" data-screen="solo" hidden>
            <div class="garage-course-panel"><div class="garage-section-heading"><div><span class="garage-eyebrow">SOLO / SELECT YOUR COURSE</span><h1>次の舞台を選ぼう。</h1></div><span class="garage-chip">CPU 11台と対戦（合計12人）</span></div>
              <div class="course-category-tabs" id="course-category-tabs"></div>
              <div class="garage-map-card" id="course-map-card">
                <div class="garage-map" id="solo-map"></div>${arrow('course-prev', 'prev', '前のコース')}${arrow('course-next', 'next', '次のコース')}<span id="course-counter" class="garage-counter"></span>
                <div class="course-tags course-tags-overlay" id="course-tags" aria-label="コースの特徴"></div>
                <div class="course-preview-caption">
                  <span class="garage-eyebrow" id="solo-course-theme">CIRCUIT</span>
                  <h2 id="solo-course-name" aria-live="polite"></h2>
                  <p id="solo-course-description" class="garage-course-description"></p>
                </div>
              </div>
              <div class="garage-course-quick-settings"><span id="solo-course-laps" class="garage-chip"></span><span id="solo-ai-level" class="garage-chip garage-chip-ai">🧠 CPU学習 Lv.1</span><button type="button" id="btn-reset-ai" class="garage-ai-reset-btn" title="このコースの学習データを初期化">↺ 学習リセット</button></div>
              <div class="course-thumb-strip" id="course-thumb-strip"></div>
              <label class="course-picker-fallback" for="course-select"><span>コース一覧</span><select id="course-select"></select></label>
            </div>
            <div class="garage-setup-side">
              <div class="garage-course-vehicle-card">
                <div class="garage-course-vehicle"><span class="garage-eyebrow">YOUR MACHINE</span><strong class="vehicle-name"></strong><span class="garage-course-vehicle-category" id="course-vehicle-category"></span></div>
                <div class="garage-course-vehicle-stats" aria-label="車体パラメータ">
                  <div class="garage-course-stat"><span>スピード</span><meter data-course-stat="topSpeed" min="0" max="50"></meter><strong data-course-stat-value="topSpeed"></strong></div>
                  <div class="garage-course-stat"><span>加速</span><meter data-course-stat="acceleration" min="0" max="35"></meter><strong data-course-stat-value="acceleration"></strong></div>
                  <div class="garage-course-stat"><span>重さ</span><meter data-course-stat="weight" min="0" max="1.5"></meter><strong data-course-stat-value="weight"></strong></div>
                </div>
                <div class="garage-course-skill"><span class="garage-skill-badge">固有スキル</span><strong id="course-skill-name"></strong><span id="course-skill-status" class="garage-skill-status"></span></div>
              </div>
              <div class="garage-course-actions"><button id="course-confirm" class="garage-button garage-button-green">✓ コース決定</button><button id="course-random" class="garage-button garage-button-light">⤨ ランダム決定</button></div>
              <p id="course-confirmation" class="garage-note" aria-live="polite">コースを選んで確定してください。</p>
              <button id="btn-start-solo" class="garage-button garage-button-start" disabled>ゲームスタート <span>→</span></button>
            </div>
          </section>
          <section class="garage-screen garage-setup" data-screen="room" hidden>
            <section class="garage-members-panel">
              <div class="garage-section-heading">
                <div><span class="garage-eyebrow">MULTIPLAYER / PADDOCK</span><h1>ルームメンバー</h1></div>
                <div class="garage-heading-badges">
                  <span id="room-online-status" class="garage-chip garage-chip-online">🟢 接続完了</span>
                  <span id="member-count" class="garage-chip"></span>
                </div>
              </div>
              <div class="garage-room-code">
                <span>ROOM ID <strong id="display-room-id"></strong></span>
                <span id="display-room-host" class="garage-room-host-tag"></span>
                <button id="room-copy" class="garage-subtle">招待URLをコピー ↗</button>
              </div>
              <div class="garage-member-name-editor">
                <label for="room-player-name">自分の名前:</label>
                <input id="room-player-name" maxlength="20" placeholder="名前を入力" autocomplete="nickname">
              </div>
              <p class="garage-network-note" role="status"></p>
              <button id="room-diagnostics" class="garage-copy-link">接続診断をコピー</button>
              <pre id="room-diagnostics-text" class="garage-diagnostics" hidden></pre>
              <ul id="players-list" class="garage-members"></ul>
              <p class="garage-note">ホストがコースを決めると、全員の画面に表示されます。</p>
            </section>
            <div class="garage-setup-side"><section class="garage-room-course"><span class="garage-eyebrow">NEXT CIRCUIT</span><h2 id="room-course-name" aria-live="polite">コース未決定</h2><button id="room-random" class="garage-button garage-button-light">⤨ ランダムコース決定</button><p id="room-role-note" class="garage-note"></p></section><div class="garage-course-vehicle"><span class="garage-eyebrow">YOUR MACHINE</span><strong class="vehicle-name"></strong><span class="garage-course-vehicle-category" id="room-vehicle-category"></span></div><button id="btn-host-start" class="garage-button garage-button-start" disabled>ゲームスタート <span>→</span></button></div>
          </section>
        </main>
        <footer class="garage-footer"><span>UO:De Car / RACING CLUB</span><span id="garage-status" role="status" aria-live="polite">好きな車体で、好きな走りを。</span><span>LET'S RACE ↗</span></footer>
      </div>
      <dialog id="room-dialog" class="garage-dialog" aria-labelledby="room-dialog-title"><form id="room-form"><div class="garage-dialog-heading"><span class="garage-eyebrow" id="room-dialog-kicker"></span><button type="button" id="room-dialog-close" class="garage-close" aria-label="閉じる">×</button></div><h2 id="room-dialog-title"></h2><p id="room-dialog-description"></p><label for="input-room-id">ルームID</label><input id="input-room-id" maxlength="32" pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*" minlength="3" required placeholder="例：weekend-race" autocapitalize="none" spellcheck="false" autocomplete="off"><small>半角英数字で3〜32文字。ハイフンは文字の間に1つずつ</small><label class="garage-invite-label" for="invite-url">招待URL</label><input id="invite-url" readonly aria-label="招待URL" placeholder="ルームIDを入力すると表示されます"><button type="button" id="dialog-copy" class="garage-copy-link">招待URLをコピー ↗</button><p class="garage-network-note" role="status"></p><button type="button" id="dialog-diagnostics" class="garage-copy-link">接続診断をコピー</button><pre id="dialog-diagnostics-text" class="garage-diagnostics" hidden></pre><p id="room-dialog-status" role="status" aria-live="polite"></p><button type="submit" id="room-submit" class="garage-button garage-button-start"></button></form></dialog>
      <div id="race-countdown" class="garage-countdown" role="alert" hidden><div><span class="garage-eyebrow">GET READY</span><h2>まもなくゲームが開始されます</h2><p id="countdown-course"></p><strong>3 · 2 · 1</strong></div></div>`;
    this.container.appendChild(this.modalEl);
    this.el('#player-name').value = localStorage.getItem('kart_player_name') || '';
    this.feedbackModal = new FeedbackModal(this.modalEl, () => this.playerName);
    this.preview = new GaragePreview(this.el('#garage-vehicle-preview'));
    this.refreshCourses();
    this.bindEvents();
    this.updateVehicle();
    this.p2pManager.onConnectionStatus = info => {
      const dialog = this.el('#room-dialog');
      if (dialog.open) this.el('#room-dialog-status').textContent = info.message;
      this.setStatus(info.message);
      const onlineEl = this.el('#room-online-status');
      if (info.stage === 'connecting' || info.stage === 'signaling' || info.stage === 'reconnecting') {
        this.showToast('connecting', info.message, 0);
        if (onlineEl) {
          onlineEl.className = 'garage-chip garage-chip-connecting';
          onlineEl.textContent = '🟡 接続試行中…';
        }
      } else if (info.stage === 'connected') {
        this.showToast('connected', 'ゲームサーバーに接続しました。', 2500);
        if (onlineEl) {
          onlineEl.className = 'garage-chip garage-chip-online';
          onlineEl.textContent = '🟢 接続中';
        }
      }
      this.modalEl.querySelectorAll('.garage-network-note').forEach(el => { el.textContent = 'ゲームサーバー経由で接続しています。'; });
    };
    this.p2pManager.onRoomState = () => this.updateRoom();
    this.p2pManager.onGameStart = data => this.startMultiplayer(data);
    const disconnected = message => {
      this.onSessionEnded?.();
      this.modalEl.hidden = false;
      if (this.el('#room-dialog').open) this.el('#room-dialog').close();
      this.returnHome();
      this.showToast('error', message || 'ゲームサーバーから切断されました。', 4000);
      this.setStatus(message);
    };
    this.p2pManager.onDisconnected = disconnected;
    this.p2pManager.onConnectionError = disconnected;
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) queueMicrotask(() => this.openDialog('guest', room));

    // ロビー要素はinit()の時点で既に表示状態のため、初回表示時もここでメニューBGMを開始する
    // （show()経由の再表示だけでなく最初の1回もカバーする）。
    AudioManager.playBgm('menu');
  }

  bindEvents() {
    const on = (id, fn) => { this.el(id).onclick = fn; };
    // Text entry and menu touches must not operate the race controls behind this UI.
    const handleNameChange = (newName) => {
      const trimmed = String(newName || '').slice(0, 20);
      localStorage.setItem('kart_player_name', trimmed.trim());
      const homeInput = this.el('#player-name');
      if (homeInput && homeInput.value !== trimmed) {
        homeInput.value = trimmed;
      }
      const roomInput = this.el('#room-player-name');
      if (roomInput && roomInput.value !== trimmed) {
        roomInput.value = trimmed;
      }
      if (this.p2pManager.roomId && typeof this.p2pManager.updateProfile === 'function') {
        this.p2pManager.updateProfile({ name: trimmed.trim() || 'プレイヤー', vehicleKey: this.vehicleKey });
      }
    };
    this.el('#player-name').addEventListener('input', e => handleNameChange(e.target.value));
    const roomNameInput = this.el('#room-player-name');
    if (roomNameInput) {
      roomNameInput.addEventListener('input', e => handleNameChange(e.target.value));
    }
    on('#vehicle-prev', () => this.changeVehicle(-1));
    on('#vehicle-next', () => this.changeVehicle(1));
    on('#detail-vehicle-prev', () => this.changeVehicle(-1));
    on('#detail-vehicle-next', () => this.changeVehicle(1));
    this.el('#garage-home-menu').querySelectorAll('[data-home-action]').forEach(button => {
      button.addEventListener('click', () => this.handleHomeAction(button.dataset.homeAction));
    });
    on('#garage-menu-toggle', () => this.toggleHomeMenu());
    this.el('[data-detail-tab="parameters"]').closest('[role="tablist"]').querySelectorAll('[data-detail-tab]').forEach(button => {
      button.addEventListener('click', () => this.setDetailTab(button.dataset.detailTab));
    });
    on('#tab-solo', () => { this.saveProfile(); this.refreshCourses(); this.confirmedCourse = null; this.showScreen('solo'); this.updateCourse(); });
    on('#tab-create', () => this.openDialog('host'));
    on('#tab-join', () => this.openDialog('guest'));
    on('#garage-back', () => this.returnHome());
    this.el('#course-select').onchange = () => {
      this.courseIndex = this.courseIds.indexOf(this.el('#course-select').value);
      this.updateCourse();
    };
    on('#course-prev', () => this.changeCourse(-1));
    on('#course-next', () => this.changeCourse(1));
    on('#course-confirm', () => this.confirmCourse());
    on('#course-random', () => { this.courseIndex = this.randomIndex(this.courseIds.length, this.courseIndex); this.updateCourse(); this.confirmCourse(); });
    on('#btn-start-solo', async () => {
      if (!this.confirmedCourse || this.starting) return;
      this.starting = true;
      this.el('#btn-start-solo').disabled = true;
      await this.prepareControls();
      if (this.screen !== 'solo') { this.starting = false; return; }
      this.launch({ mode: 'solo', courseId: this.confirmedCourse, vehicleKey: this.vehicleKey, isHost: true });
    });
    on('#room-random', () => {
      if (!this.p2pManager.isHost || this.starting) return;
      const ids = Object.keys(Courses.list);
      this.p2pManager.selectCourse(ids[this.randomIndex(ids.length, ids.indexOf(this.p2pManager.courseId))]);
    });
    on('#btn-host-start', () => {
      if (this.p2pManager.isHost && !this.starting) {
        const memberCount = this.p2pManager.members.length;
        const neededCpu = Math.max(0, 12 - memberCount);
        const aiRacers = CPU_ROSTER.slice(0, neededCpu).map((bot, idx) => ({
          ...bot,
          gridIndex: memberCount + idx
        }));

        // ミッション抽選とCPUレベルはホストが確定し、開始情報に含める（同車体の別レーサーが同じミッションになることは許容する）
        const courseCfg = Courses.getCourse(this.p2pManager.courseId);
        const missionCapabilities = {
          hasOpponents: true,
          hasCoins: !Array.isArray(courseCfg.coinLocations) || courseCfg.coinLocations.length > 0,
          hasItemBoxes: !Array.isArray(courseCfg.itemBoxLocations) || courseCfg.itemBoxLocations.length > 0
        };
        const missionAssignments = {};
        this.p2pManager.members.forEach(m => {
          missionAssignments[m.id] = drawMission(m.vehicleKey, missionCapabilities)?.id ?? null;
        });
        aiRacers.forEach(bot => {
          missionAssignments[bot.id] = drawMission(bot.vehicleKey, missionCapabilities)?.id ?? null;
        });
        const cpuLevel = readStoredLearningLevel(this.p2pManager.courseId);

        this.p2pManager.broadcastStartRace(aiRacers, missionAssignments, cpuLevel);
      }
    });
    on('#btn-reset-ai', () => {
      const courseId = this.courseIds[this.courseIndex];
      localStorage.removeItem(`kart_ai_knowledge_${courseId}`);
      this.updateCourse();
      this.setStatus('CPU学習データをリセットしました。');
    });
    on('#room-diagnostics', () => this.copyDiagnostics('room'));
    on('#dialog-diagnostics', () => this.copyDiagnostics('dialog'));
    on('#room-copy', () => this.copyInvite(this.p2pManager.roomId));
    on('#dialog-copy', () => this.copyInvite(this.el('#input-room-id').value, true));
    on('#room-dialog-close', () => this.el('#room-dialog').close());
    this.el('#room-dialog').addEventListener('close', () => {
      if (this.busy) { this.connectionAttempt++; this.p2pManager.leaveRoom(); this.busy = false; }
      this.el('#input-room-id').readOnly = false;
      this.el('.garage-shell').inert = false;
    });
    this.el('#input-room-id').addEventListener('input', () => this.updateInvite());
    this.el('#room-form').addEventListener('submit', event => { event.preventDefault(); this.connectRoom(); });

    this._menuResizeObserver = new ResizeObserver(() => this.updateMenuLayout());
    this._menuResizeObserver.observe(this.el('.garage-home-menu-wrap'));
    window.addEventListener('resize', () => {
      this.updateMenuLayout();
      this.updateDetailLayout();
      if (this.screen === 'vehicle-detail') requestAnimationFrame(() => this.preview.render());
    });
    this._menuKeydown = event => {
      if (event.key === 'Escape' && this.menuExpanded) {
        event.preventDefault();
        this.closeHomeMenu();
      }
    };
    document.addEventListener('keydown', this._menuKeydown);

    window.addEventListener('storage', (e) => {
      if (e.key === 'kart_coin_bank' || e.key === 'kart_unlocked_skills') {
        this.updateVehicle();
      }
    });
    window.addEventListener('kart-coins-updated', () => {
      this.updateVehicle();
    });
  }

  saveProfile() {
    this.el('#player-name').value = this.playerName;
    localStorage.setItem('kart_player_name', this.playerName);
    localStorage.setItem('kart_vehicle', this.vehicleKey);
  }

  changeVehicle(step) {
    this.vehicleIndex = (this.vehicleIndex + step + this.vehicleKeys.length) % this.vehicleKeys.length;
    localStorage.setItem('kart_vehicle', this.vehicleKey);
    this.updateVehicle();
  }

  handleHomeAction(action) {
    this.closeHomeMenu();
    if (action === 'vehicle-detail') this.showScreen('vehicle-detail');
    else if (action === 'editor') this.onOpenEditor?.();
    else if (action === 'updates') {
      if (!this.updateModal) this.updateModal = new UpdateModal(this.modalEl);
      this.updateModal.show();
    } else if (action === 'feedback') this.feedbackModal.show(this.playerName);
    else if (action === 'settings') this.onOpenSettings?.();
  }

  toggleHomeMenu(force = null) {
    this.menuExpanded = force === null ? !this.menuExpanded : force;
    const toggle = this.el('#garage-menu-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', String(this.menuExpanded));
    toggle.textContent = this.menuExpanded ? 'メニューを閉じる' : 'メニュー';
    this.el('#garage-home-menu')?.classList.toggle('is-open', this.menuExpanded);
    if (this.menuExpanded) {
      const first = this.el('#garage-home-menu button');
      requestAnimationFrame(() => first?.focus());
    } else {
      requestAnimationFrame(() => toggle.focus());
    }
  }

  closeHomeMenu() {
    if (this.menuExpanded) this.toggleHomeMenu(false);
  }

  updateMenuLayout() {
    const wrap = this.el('.garage-home-menu-wrap');
    const menu = this.el('#garage-home-menu');
    if (!wrap || !menu) return;
    // 固定値を引かず、現在のシェルの下端と実際のメニュー寸法で判定する。
    // 開閉式から通常表示へ戻る場合も、非表示状態の scrollHeight に依存しない。
    menu.classList.add('is-measuring');
    const menuHeight = menu.scrollHeight;
    menu.classList.remove('is-measuring');
    const shell = this.el('.garage-shell');
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const bottomPadding = shellStyle ? parseFloat(shellStyle.paddingBottom) || 0 : 0;
    const availableHeight = shell
      ? Math.max(0, shell.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top - bottomPadding)
      : menuHeight;
    const needsCollapse = menu.scrollWidth > wrap.clientWidth + 1 || menuHeight > availableHeight + 1;
    wrap.classList.toggle('menu-collapsible', needsCollapse);
    if (needsCollapse) {
      const toggleHeight = this.el('#garage-menu-toggle')?.getBoundingClientRect().height || 44;
      menu.style.setProperty('--garage-menu-max-height', `${Math.max(44, availableHeight - toggleHeight - 8)}px`);
    } else {
      menu.style.removeProperty('--garage-menu-max-height');
      this.closeHomeMenu();
    }
  }

  setDetailTab(tab) {
    if (!['parameters', 'skill', 'missions'].includes(tab)) return;
    this.detailTab = tab;
    this.modalEl.querySelectorAll('[data-detail-tab]').forEach(button => {
      const active = button.dataset.detailTab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    this.modalEl.querySelectorAll('[data-detail-section]').forEach(section => {
      section.hidden = section.dataset.detailSection !== tab;
    });
    this.updateDetailLayout();
  }

  updateDetailLayout() {
    const compact = window.innerWidth <= 850 || (window.innerWidth >= window.innerHeight && window.innerHeight <= 520);
    const tabs = this.el('.garage-detail-tabs');
    if (tabs) tabs.hidden = !compact;
    this.modalEl.querySelectorAll('[data-detail-section]').forEach(section => {
      section.hidden = compact ? section.dataset.detailSection !== this.detailTab : false;
    });
  }

  updateVehicle() {
    const vehicle = Vehicles.types[this.vehicleKey];
    this.modalEl.querySelectorAll('.vehicle-name').forEach(el => { el.textContent = vehicle.name; });
    this.modalEl.querySelectorAll('.vehicle-description').forEach(el => { el.textContent = vehicle.description || ''; });
    this.el('#vehicle-category').textContent = vehicle.category || 'カスタム';
    this.el('#vehicle-counter').textContent = `0${this.vehicleIndex + 1} / 0${this.vehicleKeys.length}`;
    this.el('#vehicle-dots').innerHTML = this.vehicleKeys.map((_, i) => `<i class="${i === this.vehicleIndex ? 'active' : ''}"></i>`).join('');
    this.el('#detail-vehicle-category').textContent = vehicle.category || 'カスタム';
    this.el('#detail-vehicle-counter').textContent = `0${this.vehicleIndex + 1} / 0${this.vehicleKeys.length}`;
    this.el('#detail-vehicle-dots').innerHTML = this.vehicleKeys.map((_, i) => `<i class="${i === this.vehicleIndex ? 'active' : ''}"></i>`).join('');
    this.modalEl.querySelectorAll('.garage-course-vehicle-category').forEach(el => { el.textContent = vehicle.category || 'カスタム'; });
    this.modalEl.querySelectorAll('[data-stat]').forEach(el => { el.value = vehicle[el.dataset.stat]; });
    this.modalEl.querySelectorAll('[data-stat-value]').forEach(el => {
      const key = el.dataset.statValue;
      el.textContent = key === 'topSpeed' ? `${Math.round(vehicle.topSpeed * 3)}` : key === 'acceleration' ? `${vehicle.acceleration}` : `${vehicle.weight.toFixed(1)}`;
    });
    this.modalEl.querySelectorAll('[data-course-stat]').forEach(el => { el.value = vehicle[el.dataset.courseStat]; });
    this.modalEl.querySelectorAll('[data-course-stat-value]').forEach(el => {
      const key = el.dataset.courseStatValue;
      el.textContent = key === 'topSpeed' ? `${Math.round(vehicle.topSpeed * 3)}` : key === 'acceleration' ? `${vehicle.acceleration}` : `${vehicle.weight.toFixed(1)}`;
    });

    // コイン残高の表示更新
    const bankCoins = SkillsManager.getBankCoins();
    const coinCountEl = this.el('#lobby-coin-count');
    if (coinCountEl) coinCountEl.textContent = String(bankCoins);

    // 固有スキルの表示・解禁ボタンの更新
    const skill = vehicle.skill;
    const isUnlocked = SkillsManager.isSkillUnlocked(this.vehicleKey);
    const courseSkillNameEl = this.el('#course-skill-name');
    const courseSkillStatusEl = this.el('#course-skill-status');
    if (courseSkillNameEl) courseSkillNameEl.textContent = skill && isUnlocked ? `${skill.icon || '⚡'} ${skill.name}` : '解放済みスキルなし';
    if (courseSkillStatusEl) {
      courseSkillStatusEl.textContent = skill && isUnlocked ? '✨ 解禁済み' : '';
      courseSkillStatusEl.className = `garage-skill-status ${skill && isUnlocked ? 'unlocked' : 'locked'}`;
    }
    const skillTitleEl = this.el('#detail-skill-title');
    const skillStatusEl = this.el('#detail-skill-status');
    const skillDescEl = this.el('#detail-skill-desc');
    const unlockBtn = this.el('#btn-unlock-skill');

    if (skill) {
      if (skillTitleEl) skillTitleEl.textContent = `${skill.icon || '⚡'} ${skill.name}`;
      if (skillDescEl) skillDescEl.textContent = skill.description;
      if (skillStatusEl) {
        skillStatusEl.textContent = isUnlocked ? '✨ 解禁済み' : '🔒 未解禁';
        skillStatusEl.className = `garage-skill-status ${isUnlocked ? 'unlocked' : 'locked'}`;
      }
      if (unlockBtn) {
        if (isUnlocked) {
          unlockBtn.textContent = '✓ 解禁済み（レース中 [F] で発動）';
          unlockBtn.disabled = true;
          unlockBtn.className = 'garage-skill-unlock-btn unlocked';
          unlockBtn.onclick = null;
        } else {
          const cost = skill.cost || 20;
          if (bankCoins >= cost) {
            unlockBtn.textContent = `🪙 ${cost} コインで解禁する！`;
            unlockBtn.disabled = false;
            unlockBtn.className = 'garage-skill-unlock-btn can-unlock';
            unlockBtn.onclick = () => {
              if (SkillsManager.unlockSkill(this.vehicleKey)) {
                this.showToast('connected', `【${skill.name}】を解禁しました！`, 2500);
                this.updateVehicle();
              }
            };
          } else {
            unlockBtn.textContent = `🪙 ${cost} コインで解禁（あと ${cost - bankCoins} 枚）`;
            unlockBtn.disabled = true;
            unlockBtn.className = 'garage-skill-unlock-btn locked';
            unlockBtn.onclick = null;
          }
        }
      }

      this.renderVehicleMissions(vehicle);
    }

    this.preview.setVehicle(this.vehicleKey);
    if (this.screen === 'vehicle-detail') requestAnimationFrame(() => this.preview.render());
  }

  renderVehicleMissions(vehicle) {
    const target = this.el('#detail-missions');
    if (!target) return;
    const missions = getVehicleMissions(this.vehicleKey);
    const buffEntries = NumericBuffTable[this.vehicleKey] || [];
    const buffText = buffEntries.map(e => `${MISSION_STAT_LABEL[e.stat] || e.stat}＋${Math.round(e.maxRatio * 100)}%`).join('・');
    target.innerHTML = `<div class="garage-detail-card"><p class="garage-mission-intro">レース開始時に3種類から1つを等確率で抽選し、初級→中級→最終の3段階で進めます。</p><ul class="mission-info-list">${missions.map(m => `<li class="mission-info-item"><div class="mission-info-item-head"><strong>${m.name}</strong><span class="garage-mission-thresholds">${m.thresholds.join(' / ')} ${m.unit === 'seconds' ? '秒' : m.unit === 'points' ? '点' : '枚'}</span></div><p>${m.description}</p></li>`).join('')}</ul><p class="garage-mission-intro">最大強化: ${buffText || '—'} ／ 2段階・3段階達成で固有スキルに追加効果 ／ CPUはコース別学習Lv.${CPU_MISSION_MIN_LEVEL}以上でのみ有効。</p></div>`;
  }

  // ガレージのミッション詳細ポップアップ（固定オーバーレイなので showroom の overflow:hidden の影響を受けない）
  showMissionModal() {
    const existing = this.container.querySelector('#garage-mission-modal');
    if (existing) existing.remove();

    const vehicle = Vehicles.types[this.vehicleKey];
    const missions = getVehicleMissions(this.vehicleKey);
    const buffEntries = NumericBuffTable[this.vehicleKey] || [];
    const buffText = buffEntries
      .map(e => `${MISSION_STAT_LABEL[e.stat] || e.stat}＋${Math.round(e.maxRatio * 100)}%`)
      .join('・');

    const modalEl = document.createElement('div');
    modalEl.id = 'garage-mission-modal';
    modalEl.className = 'modal-backdrop mission-info-modal-backdrop';
    modalEl.innerHTML = `
      <div class="mission-info-modal-card" role="dialog" aria-modal="true" aria-labelledby="mission-info-title">
        <div class="mission-info-modal-header">
          <span class="garage-mission-badge">ミッション</span>
          <h2 id="mission-info-title">${vehicle.name} の固有ミッション</h2>
          <button type="button" id="btn-close-mission-modal" class="mission-info-close-btn" aria-label="閉じる">✕</button>
        </div>
        <p class="mission-info-note">レース開始時に3種類から1つを等確率で抽選し、初級→中級→最終の3段階で進めます。</p>
        <ul class="mission-info-list">
          ${missions.map(m => `
            <li class="mission-info-item">
              <div class="mission-info-item-head">
                <strong>${m.name}</strong>
                <span class="garage-mission-thresholds">${m.thresholds.join(' / ')} ${m.unit === 'seconds' ? '秒' : m.unit === 'points' ? '点' : '枚'}</span>
              </div>
              <p>${m.description}</p>
            </li>
          `).join('')}
        </ul>
        <p class="mission-info-note">最大強化: ${buffText || '—'} ／ 2段階・3段階達成で固有スキルに追加効果 ／ CPUはコース別学習Lv.${CPU_MISSION_MIN_LEVEL}以上でのみミッションが有効になります。</p>
      </div>
    `;
    this.container.appendChild(modalEl);

    const close = () => modalEl.remove();
    modalEl.querySelector('#btn-close-mission-modal').addEventListener('click', close);
    modalEl.addEventListener('click', e => { if (e.target === modalEl) close(); });
  }

  refreshCourses() {
    this.courseIds = Object.keys(Courses.list);
    try {
      const saved = JSON.parse(localStorage.getItem('kart_custom_courses') || '{}');
      Object.keys(saved).filter(id => id.startsWith('custom_') && Array.isArray(saved[id].points) && saved[id].points.length >= 4).forEach(id => this.courseIds.push(id));
    } catch { /* Default circuits remain available if a saved course cannot be read. */ }
    this.courseIndex = Math.min(this.courseIndex, this.courseIds.length - 1);
    this.el('#course-select').replaceChildren(...this.courseIds.map(id => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = Courses.getCourse(id).name;
      return option;
    }));
    this.renderCategoryTabs();
    this.renderThumbStrip();
  }

  // カテゴリタブ（すべて + 実在するコースのテーマ種別）。フィルタはせず、該当テーマの最初の
  // コースへジャンプするショートカットとして機能させ、現在のコースのテーマを常時ハイライトする。
  renderCategoryTabs() {
    const tabsEl = this.el('#course-category-tabs');
    if (!tabsEl) return;
    const seen = new Set();
    this._courseCategories = [{ key: 'all', label: 'すべて' }];
    Object.keys(Courses.list).forEach(id => {
      const c = Courses.list[id];
      if (!seen.has(c.theme)) {
        seen.add(c.theme);
        this._courseCategories.push({ key: c.theme, label: c.themeLabel || c.theme, jumpToId: id });
      }
    });
    tabsEl.innerHTML = this._courseCategories.map(cat =>
      `<button type="button" class="course-category-tab" data-category="${cat.key}">${cat.label}</button>`
    ).join('');
    tabsEl.querySelectorAll('.course-category-tab').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.category;
        const cat = this._courseCategories.find(c => c.key === key);
        if (cat?.jumpToId) {
          const idx = this.courseIds.indexOf(cat.jumpToId);
          if (idx >= 0) this.courseIndex = idx;
        }
        this.updateCourse();
      };
    });
  }

  // サムネイル帯（全コースの小さいプレビューを並べ、タップで直接ジャンプできるようにする）
  renderThumbStrip() {
    const stripEl = this.el('#course-thumb-strip');
    if (!stripEl) return;
    stripEl.innerHTML = this.courseIds.map((id, i) => {
      const course = Courses.getCourse(id);
      return `<button type="button" class="course-thumb" data-index="${i}" title="${course.name}">${courseArt(course)}</button>`;
    }).join('');
    stripEl.querySelectorAll('.course-thumb').forEach(btn => {
      btn.onclick = () => {
        this.courseIndex = Number(btn.dataset.index);
        this.updateCourse();
      };
    });
  }

  changeCourse(step) {
    this.courseIndex = (this.courseIndex + step + this.courseIds.length) % this.courseIds.length;
    this.updateCourse();
  }

  updateCourse() {
    const course = Courses.getCourse(this.courseIds[this.courseIndex]);
    this.el('#course-select').value = this.courseIds[this.courseIndex];
    const map = this.el('#solo-map');
    map.innerHTML = courseArt(course);
    if (course.previewImage) {
      const image = document.createElement('img');
      image.className = 'garage-preview-image';
      image.alt = `${course.name}の俯瞰図`;
      image.onerror = () => { map.innerHTML = courseArt(course); };
      image.src = course.previewImage;
      map.replaceChildren(image);
    }
    this.el('#solo-course-name').textContent = course.name;
    this.el('#solo-course-theme').textContent = `${course.themeLabel || 'CIRCUIT'} / LANDMARK TOUR`;
    this.el('#solo-course-description').textContent = course.description || '';
    this.el('#solo-course-laps').textContent = `${course.totalLaps} LAPS`;

    const tagsEl = this.el('#course-tags');
    if (tagsEl) {
      tagsEl.innerHTML = deriveCourseTags(course).map(t => `<span class="course-tag-chip">${t}</span>`).join('');
    }
    const tabsEl = this.el('#course-category-tabs');
    if (tabsEl) {
      tabsEl.querySelectorAll('.course-category-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === course.theme);
      });
    }
    const stripEl = this.el('#course-thumb-strip');
    if (stripEl) {
      stripEl.querySelectorAll('.course-thumb').forEach((btn, i) => {
        btn.classList.toggle('active', i === this.courseIndex);
      });
    }

    const courseId = this.courseIds[this.courseIndex];
    let aiLaps = 0;
    try {
      const raw = localStorage.getItem(`kart_ai_knowledge_${courseId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        aiLaps = parsed.totalLapsLearned || 0;
      }
    } catch {}
    const aiLevel = Math.min(10, Math.floor(aiLaps / 2) + 1);
    const aiEl = this.el('#solo-ai-level');
    if (aiEl) {
      aiEl.textContent = `🧠 CPU学習 Lv.${aiLevel} (${aiLaps}周学習済)`;
    }

    this.el('#course-counter').textContent = `${String(this.courseIndex + 1).padStart(2, '0')} / ${String(this.courseIds.length).padStart(2, '0')}`;
    this.el('#course-confirmation').textContent = this.confirmedCourse ? `✓ 確定コース：${Courses.getCourse(this.confirmedCourse).name}${this.confirmedCourse !== this.courseIds[this.courseIndex] ? '（閲覧中のコースは未確定）' : ''}` : 'コースを選んで確定してください。';
    this.el('#btn-start-solo').disabled = !this.confirmedCourse;
  }

  confirmCourse() {
    this.confirmedCourse = this.courseIds[this.courseIndex];
    this.updateCourse();
  }

  randomIndex(length, current) {
    if (length < 2) return 0;
    if (current < 0) return Math.floor(Math.random() * length);
    return (current + 1 + Math.floor(Math.random() * (length - 1))) % length;
  }

  showScreen(screen) {
    if (this.screen === 'home' && screen !== 'home') {
      if (UpdateModal.checkAndShow(this.modalEl, () => this.showScreen(screen))) {
        return;
      }
    }
    const previousScreen = this.screen;
    this.screen = screen;
    this.modalEl.querySelectorAll('[data-screen]').forEach(el => { el.hidden = el.dataset.screen !== screen; });
    this.el('#garage-back').hidden = screen === 'home';
    const previewHost = screen === 'vehicle-detail' ? this.el('#garage-detail-vehicle-stage') : this.el('#garage-home-vehicle-stage');
    if (previewHost && this.preview?.container.parentElement !== previewHost) {
      previewHost.prepend(this.preview.container);
    }
    if (screen === 'vehicle-detail') {
      if (previousScreen !== 'vehicle-detail') this.detailTab = 'parameters';
      this.setDetailTab(this.detailTab);
      requestAnimationFrame(() => this.preview.render());
    } else if (screen === 'home') {
      this.closeHomeMenu();
      requestAnimationFrame(() => this.preview.render());
    }
  }

  openDialog(mode, room = '') {
    if (this.screen === 'home') {
      if (UpdateModal.checkAndShow(this.modalEl, () => this.openDialog(mode, room))) {
        return;
      }
    }
    this.saveProfile();
    this.dialogMode = mode;
    const host = mode === 'host';
    this.el('#room-dialog-kicker').textContent = host ? 'CREATE A ROOM / HOST' : 'JOIN A ROOM / GUEST';
    this.el('#room-dialog-title').textContent = host ? 'ルームを作成' : 'ルームに参加';
    this.el('#room-dialog-description').textContent = host ? '好きなIDを決めて、友だちを招待しよう。' : 'ホストから教えてもらったIDを入力しよう。';
    this.el('#room-submit').textContent = host ? 'ルーム作成 →' : 'ルーム参加 →';
    this.el('#room-submit').disabled = false;
    this.el('#room-dialog-status').textContent = '';
    this.modalEl.querySelectorAll('.garage-network-note').forEach(el => el.textContent = '');
    this.el('#dialog-diagnostics-text').hidden = true;
    this.el('#input-room-id').value = room;
    this.updateInvite();
    this.el('.garage-shell').inert = true;
    this.el('#room-dialog').showModal();
    this.el('#input-room-id').focus();
  }

  async connectRoom() {
    if (this.busy) return;
    let roomId;
    try { roomId = normalizeRoomId(this.el('#input-room-id').value); }
    catch (error) { this.el('#room-dialog-status').textContent = error.message; return; }
    const attempt = ++this.connectionAttempt;
    this.busy = true;
    this.el('#input-room-id').readOnly = true;
    this.el('#room-submit').disabled = true;
    this.el('#room-dialog-status').textContent = this.dialogMode === 'host' ? 'ルームを作成しています…' : 'ホストに接続しています…';
    try {
      await this.prepareControls();
      if (!this.busy || attempt !== this.connectionAttempt) return;
      const data = { roomId, name: this.playerName, vehicleKey: this.vehicleKey };
      if (this.dialogMode === 'host') await this.p2pManager.createRoom(data);
      else await this.p2pManager.joinRoom(roomId, data);
      if (!this.busy || attempt !== this.connectionAttempt) return;
      this.busy = false;
      this.el('#room-dialog').close();
      this.showScreen('room');
      this.updateRoom();
      this.showToast('connected', 'ルームに接続しました。', 2500);
      this.setStatus('ルームに接続しました。');
    } catch (error) {
      if (attempt !== this.connectionAttempt) return;
      if (this.el('#room-dialog').open) this.el('#room-dialog-status').textContent = error.message;
      this.busy = false;
      this.el('#room-submit').disabled = false;
      this.el('#input-room-id').readOnly = false;
    }
  }

  showToast(type, text, durationMs = 3000) {
    const toast = this.el('#garage-toast');
    if (!toast) return;
    clearTimeout(this._toastTimer);
    toast.className = `garage-toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'connecting') icon = '<span class="toast-spinner"></span>';
    else if (type === 'success' || type === 'connected') icon = '✅';
    else if (type === 'error') icon = '⚠️';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${text}</span>`;
    toast.classList.remove('hidden');

    if (durationMs > 0) {
      this._toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, durationMs);
    }
  }

  updateRoom() {
    const p2p = this.p2pManager;
    this.el('#display-room-id').textContent = p2p.roomId || '';
    this.el('#member-count').textContent = `${p2p.members.length} / 12 人（不足${Math.max(0, 12 - p2p.members.length)}枠はCPU参戦）`;

    const hostMember = p2p.members.find(m => m.isHost);
    const hostTagEl = this.el('#display-room-host');
    if (hostTagEl) {
      hostTagEl.innerHTML = hostMember ? `👑 主催者: <strong>${hostMember.name}</strong>` : '';
    }

    const roomNameInput = this.el('#room-player-name');
    if (roomNameInput && document.activeElement !== roomNameInput) {
      roomNameInput.value = this.playerName;
    }

    const list = this.el('#players-list');
    list.replaceChildren();
    [...p2p.members].sort((a, b) => Number(b.isHost) - Number(a.isHost)).forEach((member, i) => {
      const isMe = member.id === p2p.myPeerId;
      const row = document.createElement('li');
      row.className = `garage-member ${member.isHost ? 'is-host' : ''} ${isMe ? 'is-me' : ''}`;

      const avatar = document.createElement('span');
      avatar.className = `garage-avatar ${member.isHost ? 'avatar-host' : ''}`;
      avatar.textContent = member.isHost ? '👑' : member.name.slice(0, 1);

      const info = document.createElement('div');
      info.className = 'garage-member-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'garage-member-name-row';
      const name = document.createElement('strong');
      name.textContent = member.name;
      nameRow.appendChild(name);

      if (isMe) {
        const youTag = document.createElement('span');
        youTag.className = 'garage-badge-you';
        youTag.textContent = 'あなた';
        nameRow.appendChild(youTag);
      }

      const car = document.createElement('small');
      car.textContent = Vehicles.types[member.vehicleKey]?.name || '';
      info.append(nameRow, car);

      const badge = document.createElement('span');
      badge.className = `garage-member-role ${member.isHost ? 'garage-badge-host' : 'garage-badge-guest'}`;
      badge.innerHTML = member.isHost ? '<span class="role-icon">👑</span> ホスト' : `<span class="role-icon">🎮</span> ゲスト`;

      row.append(avatar, info, badge);
      list.appendChild(row);
    });
    if (p2p.members.length === 1) {
      const empty = document.createElement('li');
      empty.className = 'garage-member-empty';
      empty.textContent = '＋ 招待URLを送って、友だちを待とう。不足枠はCPUが参戦します。';
      list.appendChild(empty);
    }
    this.el('#room-course-name').textContent = p2p.courseId ? Courses.getCourse(p2p.courseId).name : 'コース未決定';
    this.el('#room-random').disabled = !p2p.isHost || this.starting || p2p.phase !== 'lobby';
    this.el('#btn-host-start').disabled = !p2p.isHost || !p2p.courseId || this.starting || p2p.phase !== 'lobby';
    this.el('#room-role-note').textContent = p2p.isHost ? 'あなたがホストです。コースを決定してレースを開始。' : 'コース決定・ゲーム開始はホストが操作します。';
  }

  inviteUrl(value) {
    const id = normalizeRoomId(value);
    const url = new URL(window.location.href);
    url.search = ''; url.hash = ''; url.searchParams.set('room', id);
    return url.href;
  }

  updateInvite() {
    try {
      this.el('#invite-url').value = this.inviteUrl(this.el('#input-room-id').value);
      this.el('#dialog-copy').disabled = false;
    } catch {
      this.el('#invite-url').value = '';
      this.el('#dialog-copy').disabled = true;
    }
  }

  async copyInvite(value, inDialog = false) {
    const status = inDialog ? this.el('#room-dialog-status') : this.el('#garage-status');
    try {
      await navigator.clipboard.writeText(this.inviteUrl(value));
      status.textContent = '招待URLをコピーしました。';
    } catch (error) {
      status.textContent = error.message.includes('ルームID') ? error.message : 'コピーできませんでした。ルームIDを直接伝えてください。';
    }
  }

  async copyDiagnostics(location) {
    const text = this.p2pManager.getDiagnostics();
    const output = this.el(`#${location}-diagnostics-text`);
    try {
      await navigator.clipboard.writeText(text);
      output.textContent = '接続診断をコピーしました。'; output.hidden = false;
    } catch {
      output.textContent = text; output.hidden = false;
    }
  }

  async prepareControls() {
    if (this.inputManager?.controlMode === 'gyro' && !this.inputManager.gyroActive && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const granted = await this.inputManager.requestGyroPermission();
      if (!granted) this.inputManager.setControlMode('stick');
    }
  }

  startMultiplayer(data) {
    if (this.starting || !this.p2pManager.roomId) return;
    this.starting = true;
    this.el('#countdown-course').textContent = Courses.getCourse(data.courseId).name;
    this.el('#race-countdown').hidden = false;
    this.updateRoom();
    this.startTimer = setTimeout(() => {
      if (!this.p2pManager.roomId) return;
      this.el('#race-countdown').hidden = true;
      this.launch({
        mode: this.p2pManager.isHost ? 'multi_host' : 'multi_guest',
        courseId: data.courseId,
        vehicleKey: this.vehicleKey,
        isHost: this.p2pManager.isHost,
        aiRacers: data.aiRacers || [],
        missionAssignments: data.missionAssignments || {},
        cpuLevel: data.cpuLevel || 1
      });
    }, data.delayMs);
  }

  launch(config) {
    this.inputManager?.resetState();
    this.hide();
    this.onStartGame({ ...config, playerName: this.playerName });
  }

  returnHome() {
    this.connectionAttempt++;
    clearTimeout(this.startTimer);
    this.p2pManager.leaveRoom();
    this.starting = false;
    this.busy = false;
    this.el('#race-countdown').hidden = true;
    this.showScreen('home');
    this.updateVehicle();
    this.setStatus('好きな車体で、好きな走りを。');
  }

  setStatus(text) { this.el('#garage-status').textContent = text; }
  populateCourseSelects() { this.refreshCourses(); }
  show() { this.modalEl.hidden = false; this.returnHome(); this.refreshCourses(); this.updateVehicle(); AudioManager.playBgm('menu'); }
  hide() { this.modalEl.hidden = true; }
}
