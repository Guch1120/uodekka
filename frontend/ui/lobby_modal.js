import { Vehicles } from '../vehicles/vehicles.js';
import { Courses } from '../courses/index.js';
import { P2PManager } from '../../backend/network/p2p_manager.js';
import { GaragePreview, courseArt } from './lobby_preview.js';

const details = {
  standard_red: ['BALANCED', 'バランス型', '扱いやすさと速さを両立。最初の一台に。'],
  speed_blue: ['HIGH SPEED', '高速型', '最高速と重さを武器に、ストレートを駆け抜ける。'],
  handling_green: ['AGILITY', '軽量型', '鋭い加速と軽快なハンドリングでコーナーを攻略。']
};
const arrow = (id, direction, label) => `<button id="${id}" class="garage-arrow" aria-label="${label}">${direction === 'prev' ? '◀' : '▶'}</button>`;
const stats = () => `<section class="garage-specs"><div class="garage-eyebrow">YOUR MACHINE</div><h2 class="vehicle-name"></h2><p class="vehicle-description"></p><div class="garage-stat-list">${[['topSpeed', 'スピード', 50], ['acceleration', '加速', 35], ['weight', '重さ', 1.5]].map(([key, label, max]) => `<label class="garage-stat"><span>${label}</span><meter data-stat="${key}" min="0" max="${max}" aria-label="${label}"></meter><span data-stat-value="${key}" class="garage-stat-value"></span></label>`).join('')}</div></section>`;

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
        <header class="garage-header">
          <div class="garage-brand"><span class="garage-brand-mark">U<span>•</span>D</span><div>UO:De Car<small>READY. SET. DRIVE.</small></div></div>
          <div class="garage-location"><span class="garage-live-dot"></span><span id="garage-location">ホーム / GARAGE</span></div>
          <button id="garage-back" class="garage-subtle" hidden>← ホームへ</button>
        </header>
        <main>
          <section class="garage-screen garage-home" data-screen="home">
            <div class="garage-machine-panel">
              <div class="garage-section-heading"><div><span class="garage-eyebrow">01 / SELECT YOUR MACHINE</span><h1>相棒を選ぼう。</h1></div><label class="garage-player-label">プレイヤー名<input id="player-name" maxlength="20" placeholder="名前を入力" autocomplete="nickname"></label></div>
              <div class="garage-showroom">
                <div class="garage-showroom-top"><span class="garage-chip" id="vehicle-category"></span><span id="vehicle-counter" class="garage-counter"></span></div>
                <div class="garage-vehicle-stage"><div id="garage-vehicle-preview"></div>${arrow('vehicle-prev', 'prev', '前の車体')}${arrow('vehicle-next', 'next', '次の車体')}</div>
                <div class="garage-vehicle-caption"><div><span class="garage-eyebrow">YOUR MACHINE</span><h2 class="vehicle-name" aria-live="polite"></h2></div><div id="vehicle-dots" class="garage-dots" aria-hidden="true"></div></div>
              </div>
            </div>
            <div class="garage-mode-panel"><div class="garage-mode-heading"><span class="garage-eyebrow">02 / CHOOSE YOUR RACE</span><h2>さあ、走り出そう。</h2></div>
              <button id="tab-solo" class="garage-mode garage-mode-solo"><span class="garage-mode-icon">01</span><span><small>SOLO RACE</small><strong>ソロゲーム</strong><span class="garage-mode-description">CPUと競う、自分だけのレース。</span></span><span class="garage-mode-arrow">↗</span><span class="garage-mode-tag">CPU 対戦</span></button>
              <section class="garage-mode garage-mode-multi"><span class="garage-mode-icon">02</span><div><small>MULTIPLAYER</small><h2>マルチゲーム</h2><p>ルームに集まって、友だちと対戦。</p></div><div class="garage-multi-actions"><button id="tab-create">ホスト <span>ルームを作成 ↗</span></button><button id="tab-join">ゲスト <span>ルームに参加 ↗</span></button></div></section>
              <button id="tab-editor" class="garage-editor-link">＋ コースを作る <span>COURSE EDITOR ↗</span></button>
            </div>
          </section>
          <section class="garage-screen garage-setup" data-screen="solo" hidden>
            <div class="garage-course-panel"><div class="garage-section-heading"><div><span class="garage-eyebrow">SOLO / SELECT YOUR COURSE</span><h1>次の舞台を選ぼう。</h1></div><span class="garage-chip">CPU 3台と対戦</span></div>
              <div class="garage-map-card"><div class="garage-map" id="solo-map"></div>${arrow('course-prev', 'prev', '前のコース')}${arrow('course-next', 'next', '次のコース')}<span id="course-counter" class="garage-counter"></span></div>
              <div class="garage-course-caption"><div><span class="garage-eyebrow">CIRCUIT</span><h2 id="solo-course-name" aria-live="polite"></h2></div><span id="solo-course-laps" class="garage-chip"></span></div>
            </div>
            <div class="garage-setup-side"><div class="garage-course-actions"><button id="course-confirm" class="garage-button garage-button-green">✓ コース決定</button><button id="course-random" class="garage-button garage-button-light">⤨ ランダム決定</button></div><p id="course-confirmation" class="garage-note" aria-live="polite">コースを選んで確定してください。</p>${stats()}<button id="btn-start-solo" class="garage-button garage-button-start" disabled>ゲームスタート <span>→</span></button></div>
          </section>
          <section class="garage-screen garage-setup" data-screen="room" hidden>
            <section class="garage-members-panel"><div class="garage-section-heading"><div><span class="garage-eyebrow">MULTIPLAYER / PADDOCK</span><h1>ルームメンバー</h1></div><span id="member-count" class="garage-chip"></span></div><div class="garage-room-code"><span>ROOM ID <strong id="display-room-id"></strong></span><button id="room-copy" class="garage-subtle">招待URLをコピー ↗</button></div><ul id="players-list" class="garage-members"></ul><p class="garage-note">ホストがコースを決めると、全員の画面に表示されます。</p></section>
            <div class="garage-setup-side"><section class="garage-room-course"><span class="garage-eyebrow">NEXT CIRCUIT</span><h2 id="room-course-name" aria-live="polite">コース未決定</h2><button id="room-random" class="garage-button garage-button-light">⤨ ランダムコース決定</button><p id="room-role-note" class="garage-note"></p></section>${stats()}<button id="btn-host-start" class="garage-button garage-button-start" disabled>ゲームスタート <span>→</span></button></div>
          </section>
        </main>
        <footer class="garage-footer"><span>UO:De Car / RACING CLUB</span><span id="garage-status" role="status" aria-live="polite">好きな車体で、好きな走りを。</span><span>LET'S RACE ↗</span></footer>
      </div>
      <dialog id="room-dialog" class="garage-dialog" aria-labelledby="room-dialog-title"><form id="room-form"><div class="garage-dialog-heading"><span class="garage-eyebrow" id="room-dialog-kicker"></span><button type="button" id="room-dialog-close" class="garage-close" aria-label="閉じる">×</button></div><h2 id="room-dialog-title"></h2><p id="room-dialog-description"></p><label for="input-room-id">ルームID</label><input id="input-room-id" maxlength="32" pattern="[a-zA-Z0-9][a-zA-Z0-9-]{2,31}" required placeholder="例：weekend-race" autocapitalize="none" spellcheck="false" autocomplete="off"><small>半角英数字・ハイフン、3〜32文字</small><button type="button" id="dialog-copy" class="garage-copy-link">招待URLをコピー ↗</button><p id="room-dialog-status" role="status" aria-live="polite"></p><button type="submit" id="room-submit" class="garage-button garage-button-start"></button></form></dialog>
      <div id="race-countdown" class="garage-countdown" role="alert" hidden><div><span class="garage-eyebrow">GET READY</span><h2>まもなくゲームが開始されます</h2><p id="countdown-course"></p><strong>3 · 2 · 1</strong></div></div>`;
    this.container.appendChild(this.modalEl);
    this.el('#player-name').value = localStorage.getItem('kart_player_name') || '';
    this.preview = new GaragePreview(this.el('#garage-vehicle-preview'));
    this.refreshCourses();
    this.bindEvents();
    this.updateVehicle();
    this.p2pManager.onRoomState = () => this.updateRoom();
    this.p2pManager.onGameStart = data => this.startMultiplayer(data);
    const disconnected = message => {
      this.onSessionEnded?.();
      this.modalEl.hidden = false;
      if (this.el('#room-dialog').open) this.el('#room-dialog').close();
      this.returnHome();
      this.setStatus(message);
    };
    this.p2pManager.onDisconnected = disconnected;
    this.p2pManager.onConnectionError = disconnected;
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) queueMicrotask(() => this.openDialog('guest', room));
  }

  bindEvents() {
    const on = (id, fn) => { this.el(id).onclick = fn; };
    // Text entry and menu touches must not operate the race controls behind this UI.
    ['keydown', 'keyup', 'touchstart', 'touchend'].forEach(type => this.modalEl.addEventListener(type, event => event.stopPropagation()));
    this.el('#player-name').addEventListener('input', () => localStorage.setItem('kart_player_name', this.playerName));
    on('#vehicle-prev', () => this.changeVehicle(-1));
    on('#vehicle-next', () => this.changeVehicle(1));
    on('#tab-solo', () => { this.saveProfile(); this.refreshCourses(); this.confirmedCourse = null; this.showScreen('solo'); this.updateCourse(); });
    on('#tab-create', () => this.openDialog('host'));
    on('#tab-join', () => this.openDialog('guest'));
    on('#tab-editor', () => this.onOpenEditor?.());
    on('#garage-back', () => this.returnHome());
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
    on('#btn-host-start', () => { if (this.p2pManager.isHost && !this.starting) this.p2pManager.broadcastStartRace(); });
    on('#room-copy', () => this.copyInvite(this.p2pManager.roomId));
    on('#dialog-copy', () => this.copyInvite(this.el('#input-room-id').value, true));
    on('#room-dialog-close', () => this.el('#room-dialog').close());
    this.el('#room-dialog').addEventListener('close', () => {
      if (this.busy) { this.connectionAttempt++; this.p2pManager.leaveRoom(); this.busy = false; }
      this.el('.garage-shell').inert = false;
    });
    this.el('#room-form').addEventListener('submit', event => { event.preventDefault(); this.connectRoom(); });
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

  updateVehicle() {
    const vehicle = Vehicles.types[this.vehicleKey];
    this.modalEl.querySelectorAll('.vehicle-name').forEach(el => { el.textContent = vehicle.name; });
    this.modalEl.querySelectorAll('.vehicle-description').forEach(el => { el.textContent = details[this.vehicleKey][2]; });
    this.el('#vehicle-category').textContent = details[this.vehicleKey][1];
    this.el('#vehicle-counter').textContent = `0${this.vehicleIndex + 1} / 0${this.vehicleKeys.length}`;
    this.el('#vehicle-dots').innerHTML = this.vehicleKeys.map((_, i) => `<i class="${i === this.vehicleIndex ? 'active' : ''}"></i>`).join('');
    this.modalEl.querySelectorAll('[data-stat]').forEach(el => { el.value = vehicle[el.dataset.stat]; });
    this.modalEl.querySelectorAll('[data-stat-value]').forEach(el => {
      const key = el.dataset.statValue;
      el.textContent = key === 'topSpeed' ? `${Math.round(vehicle.topSpeed * 3)}` : key === 'acceleration' ? `${vehicle.acceleration}` : `${vehicle.weight.toFixed(1)}`;
    });
    this.preview.setVehicle(this.vehicleKey);
  }

  refreshCourses() {
    this.courseIds = Object.keys(Courses.list);
    try {
      const saved = JSON.parse(localStorage.getItem('kart_custom_courses') || '{}');
      Object.keys(saved).filter(id => id.startsWith('custom_') && Array.isArray(saved[id].points) && saved[id].points.length >= 4).forEach(id => this.courseIds.push(id));
    } catch { /* Default circuits remain available if a saved course cannot be read. */ }
    this.courseIndex = Math.min(this.courseIndex, this.courseIds.length - 1);
  }

  changeCourse(step) {
    this.courseIndex = (this.courseIndex + step + this.courseIds.length) % this.courseIds.length;
    this.confirmedCourse = null;
    this.updateCourse();
  }

  updateCourse() {
    const course = Courses.getCourse(this.courseIds[this.courseIndex]);
    this.el('#solo-map').innerHTML = courseArt(course);
    this.el('#solo-course-name').textContent = course.name;
    this.el('#solo-course-laps').textContent = `${course.totalLaps} LAPS`;
    this.el('#course-counter').textContent = `${String(this.courseIndex + 1).padStart(2, '0')} / ${String(this.courseIds.length).padStart(2, '0')}`;
    this.el('#course-confirmation').textContent = this.confirmedCourse ? `✓ ${course.name}で決定` : 'コースを選んで確定してください。';
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
    this.screen = screen;
    this.modalEl.querySelectorAll('[data-screen]').forEach(el => { el.hidden = el.dataset.screen !== screen; });
    this.el('#garage-back').hidden = screen === 'home';
    this.el('#garage-location').textContent = { home: 'ホーム / GARAGE', solo: 'ソロ / COURSE SELECT', room: 'マルチ / ROOM LOBBY' }[screen];
    if (screen === 'home') requestAnimationFrame(() => this.preview.render());
  }

  openDialog(mode, room = '') {
    this.saveProfile();
    this.dialogMode = mode;
    const host = mode === 'host';
    this.el('#room-dialog-kicker').textContent = host ? 'CREATE A ROOM / HOST' : 'JOIN A ROOM / GUEST';
    this.el('#room-dialog-title').textContent = host ? 'ルームを作成' : 'ルームに参加';
    this.el('#room-dialog-description').textContent = host ? '好きなIDを決めて、友だちを招待しよう。' : 'ホストから教えてもらったIDを入力しよう。';
    this.el('#room-submit').textContent = host ? 'ルーム作成 →' : 'ルーム参加 →';
    this.el('#room-submit').disabled = false;
    this.el('#room-dialog-status').textContent = '';
    this.el('#input-room-id').value = room;
    this.el('.garage-shell').inert = true;
    this.el('#room-dialog').showModal();
    this.el('#input-room-id').focus();
  }

  async connectRoom() {
    if (this.busy) return;
    let roomId;
    try { roomId = P2PManager.normalizeRoomId(this.el('#input-room-id').value); }
    catch (error) { this.el('#room-dialog-status').textContent = error.message; return; }
    const attempt = ++this.connectionAttempt;
    this.busy = true;
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
      this.setStatus('ルームに接続しました。');
    } catch (error) {
      if (attempt !== this.connectionAttempt) return;
      if (this.el('#room-dialog').open) this.el('#room-dialog-status').textContent = error.message;
      this.busy = false;
      this.el('#room-submit').disabled = false;
    }
  }

  updateRoom() {
    const p2p = this.p2pManager;
    this.el('#display-room-id').textContent = p2p.roomId || '';
    this.el('#member-count').textContent = `${p2p.members.length} / 8 人`;
    const list = this.el('#players-list');
    list.replaceChildren();
    [...p2p.members].sort((a, b) => Number(b.isHost) - Number(a.isHost)).forEach((member, i) => {
      const row = document.createElement('li');
      row.className = `garage-member ${member.isHost ? 'is-host' : ''}`;
      const avatar = document.createElement('span'); avatar.className = 'garage-avatar'; avatar.textContent = member.name.slice(0, 1);
      const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = member.name + (member.id === p2p.myPeerId ? '（あなた）' : '');
      const car = document.createElement('small'); car.textContent = Vehicles.types[member.vehicleKey]?.name || '';
      info.append(name, car);
      const badge = document.createElement('span'); badge.className = 'garage-member-role'; badge.textContent = member.isHost ? 'HOST' : `GUEST ${String(i).padStart(2, '0')}`;
      row.append(avatar, info, badge); list.appendChild(row);
    });
    if (p2p.members.length === 1) {
      const empty = document.createElement('li'); empty.className = 'garage-member-empty'; empty.textContent = '＋ 招待URLを送って、友だちを待とう。'; list.appendChild(empty);
    }
    this.el('#room-course-name').textContent = p2p.courseId ? Courses.getCourse(p2p.courseId).name : 'コース未決定';
    this.el('#room-random').disabled = !p2p.isHost || this.starting || p2p.phase !== 'lobby';
    this.el('#btn-host-start').disabled = !p2p.isHost || !p2p.courseId || this.starting || p2p.phase !== 'lobby';
    this.el('#room-role-note').textContent = p2p.isHost ? 'あなたがホストです。コースを決定してレースを開始。' : 'コース決定・ゲーム開始はホストが操作します。';
  }

  async copyInvite(value, inDialog = false) {
    const status = inDialog ? this.el('#room-dialog-status') : this.el('#garage-status');
    try {
      const id = P2PManager.normalizeRoomId(value);
      const url = new URL(window.location.href);
      url.search = ''; url.hash = ''; url.searchParams.set('room', id);
      await navigator.clipboard.writeText(url.href);
      status.textContent = '招待URLをコピーしました。';
    } catch (error) {
      status.textContent = error.message.includes('ルームID') ? error.message : 'コピーできませんでした。ルームIDを直接伝えてください。';
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
      this.launch({ mode: this.p2pManager.isHost ? 'multi_host' : 'multi_guest', courseId: data.courseId, vehicleKey: this.vehicleKey, isHost: this.p2pManager.isHost });
    }, data.delayMs);
  }

  launch(config) {
    this.inputManager?.resetState();
    this.hide();
    this.onStartGame(config);
  }

  returnHome() {
    this.connectionAttempt++;
    clearTimeout(this.startTimer);
    this.p2pManager.leaveRoom();
    this.starting = false;
    this.busy = false;
    this.el('#race-countdown').hidden = true;
    this.showScreen('home');
    this.setStatus('好きな車体で、好きな走りを。');
  }

  setStatus(text) { this.el('#garage-status').textContent = text; }
  populateCourseSelects() { this.refreshCourses(); }
  show() { this.modalEl.hidden = false; this.returnHome(); this.refreshCourses(); }
  hide() { this.modalEl.hidden = true; }
}
