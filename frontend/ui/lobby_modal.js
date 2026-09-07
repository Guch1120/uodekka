// frontend/ui/lobby_modal.js
// サーバーレスP2Pマルチプレイ（ルーム作成・参加・QRコード表示）
export class LobbyModal {
  constructor(container, p2pManager, onStartGame, inputManager = null) {
    this.container = container;
    this.p2pManager = p2pManager;
    this.onStartGame = onStartGame;
    this.inputManager = inputManager;
    this.modalEl = null;
    this.init();
  }

  init() {
    const modal = document.createElement('div');
    modal.id = 'lobby-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-dialog lobby-dialog">
        <div class="modal-header">
          <h2>マルチプレイ対戦 (P2Pサーバーレス)</h2>
        </div>
        <div class="modal-body">
          <div class="lobby-tabs">
            <button id="tab-create" class="tab-btn active">部屋をつくる (ホスト)</button>
            <button id="tab-join" class="tab-btn">部屋に入る (ゲスト)</button>
            <button id="tab-solo" class="tab-btn solo-btn">ひとりで遊ぶ (CPU対戦)</button>
          </div>

          <!-- ホスト画面 -->
          <div id="section-host" class="lobby-section">
            <p class="section-desc">ルームを作成して友だちにルームIDまたはQRコードを共有してください。</p>
            <div class="form-group">
              <label>コース選択:</label>
              <select id="select-host-course" class="custom-select">
                <option value="course1">コース1: ピーチ・サーキット (高速オーバル)</option>
                <option value="course2">コース2: サンセット・キャニオン (荒野・起伏)</option>
                <option value="course3">コース3: コズミック・ネオン (宇宙ハイウェイ)</option>
              </select>
            </div>
            <div class="form-group">
              <label>使用カート:</label>
              <select id="select-host-vehicle" class="custom-select">
                <option value="standard_red">レッド・ストリーム (バランス型)</option>
                <option value="speed_blue">ブルー・ファルコン (高速ドリフト型)</option>
                <option value="handling_green">グリーン・ツイスター (高旋回・高加速型)</option>
              </select>
            </div>
            <button id="btn-create-room" class="primary-btn full-btn">部屋を作成してID発行</button>

            <div id="host-room-info" class="room-info hidden">
              <div class="room-code-display">
                <span class="label">ルームID:</span>
                <span id="display-room-id" class="code-val">------</span>
                <button id="btn-copy-url" class="btn-sm">招待URLコピー</button>
              </div>
              <div class="qr-container">
                <img id="host-qr-img" alt="招待QRコード" />
              </div>
              <div class="connected-list">
                <strong>接続中プレイヤー (<span id="connected-count">1</span>人):</strong>
                <ul id="players-list">
                  <li>あなた (ホスト)</li>
                </ul>
              </div>
              <button id="btn-host-start" class="start-race-btn">レース開始！</button>
            </div>
          </div>

          <!-- ゲスト画面 -->
          <div id="section-join" class="lobby-section hidden">
            <p class="section-desc">ホストから教わったルームIDを入力して参加します。</p>
            <div class="form-group">
              <label>ルームID:</label>
              <input type="text" id="input-room-id" placeholder="例: kart-1234" class="custom-input" />
            </div>
            <div class="form-group">
              <label>使用カート:</label>
              <select id="select-guest-vehicle" class="custom-select">
                <option value="speed_blue">ブルー・ファルコン (高速ドリフト型)</option>
                <option value="standard_red">レッド・ストリーム (バランス型)</option>
                <option value="handling_green">グリーン・ツイスター (高旋回・高加速型)</option>
              </select>
            </div>
            <button id="btn-join-room" class="primary-btn full-btn">ルームに参加</button>
            <div id="guest-status" class="status-msg hidden">ホストに接続中...</div>
          </div>

          <!-- ソロプレイ画面 -->
          <div id="section-solo" class="lobby-section hidden">
            <p class="section-desc">3台のCPUプレイヤーと一緒にシングルレースをプレイします。</p>
            <div class="form-group">
              <label>コース選択:</label>
              <select id="select-solo-course" class="custom-select">
                <option value="course1">コース1: ピーチ・サーキット</option>
                <option value="course2">コース2: サンセット・キャニオン</option>
                <option value="course3">コース3: コズミック・ネオン</option>
              </select>
            </div>
            <div class="form-group">
              <label>使用カート:</label>
              <select id="select-solo-vehicle" class="custom-select">
                <option value="standard_red">レッド・ストリーム</option>
                <option value="speed_blue">ブルー・ファルコン</option>
                <option value="handling_green">グリーン・ツイスター</option>
              </select>
            </div>
            <button id="btn-start-solo" class="primary-btn full-btn">レーススタート</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(modal);
    this.modalEl = modal;

    this.bindEvents();
    this.checkUrlParams();
  }

  bindEvents() {
    const modal = this.modalEl;
    const tabCreate = modal.querySelector('#tab-create');
    const tabJoin = modal.querySelector('#tab-join');
    const tabSolo = modal.querySelector('#tab-solo');
    const secHost = modal.querySelector('#section-host');
    const secJoin = modal.querySelector('#section-join');
    const secSolo = modal.querySelector('#section-solo');

    tabCreate.onclick = () => {
      tabCreate.classList.add('active');
      tabJoin.classList.remove('active');
      tabSolo.classList.remove('active');
      secHost.classList.remove('hidden');
      secJoin.classList.add('hidden');
      secSolo.classList.add('hidden');
    };

    tabJoin.onclick = () => {
      tabJoin.classList.add('active');
      tabCreate.classList.remove('active');
      tabSolo.classList.remove('active');
      secJoin.classList.remove('hidden');
      secHost.classList.add('hidden');
      secSolo.classList.add('hidden');
    };

    tabSolo.onclick = () => {
      tabSolo.classList.add('active');
      tabCreate.classList.remove('active');
      tabJoin.classList.remove('active');
      secSolo.classList.remove('hidden');
      secHost.classList.add('hidden');
      secJoin.classList.add('hidden');
    };

    // ホスト: 部屋作成
    const btnCreate = modal.querySelector('#btn-create-room');
    btnCreate.onclick = async () => {
      btnCreate.disabled = true;
      btnCreate.textContent = 'ルーム作成中...';

      const courseId = modal.querySelector('#select-host-course').value;
      const vehicleKey = modal.querySelector('#select-host-vehicle').value;

      try {
        const roomId = await this.p2pManager.createRoom({ courseId, vehicleKey });
        modal.querySelector('#host-room-info').classList.remove('hidden');
        modal.querySelector('#display-room-id').textContent = roomId;

        // 共有URL
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
        // QRコード画像API
        const qrImg = modal.querySelector('#host-qr-img');
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(shareUrl)}`;

        modal.querySelector('#btn-copy-url').onclick = () => {
          navigator.clipboard.writeText(shareUrl).then(() => alert('招待URLをコピーしました！'));
        };

        btnCreate.style.display = 'none';

        // プレイヤー参加コールバック
        this.p2pManager.onPlayerJoined = (peerId) => {
          const list = modal.querySelector('#players-list');
          const li = document.createElement('li');
          li.textContent = `プレイヤー (${peerId.slice(-4)}) 参加`;
          list.appendChild(li);
          modal.querySelector('#connected-count').textContent = this.p2pManager.peers.length + 1;
        };
      } catch (err) {
        alert('ルーム作成に失敗しました: ' + err.message);
        btnCreate.disabled = false;
        btnCreate.textContent = '部屋を作成してID発行';
      }
    };

    const startGameWithGyroCheck = async (gameConfig) => {
      // 横画面・フルスクリーンの自動要求
      try {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen().catch(() => {});
        }
      } catch (e) {}

      if (this.inputManager && this.inputManager.controlMode === 'gyro' && !this.inputManager.gyroActive) {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const wantGyro = confirm('ジャイロ操作（スマホの傾き操作）が有効です。センサーへのアクセスを許可しますか？\n（「キャンセル」を押すと画面スティック操作に切り替わります）');
          if (wantGyro) {
            await this.inputManager.requestGyroPermission();
          } else {
            this.inputManager.setControlMode('stick');
          }
        }
      }
      this.hide();
      this.onStartGame(gameConfig);
    };

    // ホスト: レース開始
    modal.querySelector('#btn-host-start').onclick = async () => {
      const courseId = modal.querySelector('#select-host-course').value;
      const vehicleKey = modal.querySelector('#select-host-vehicle').value;
      this.p2pManager.broadcastStartRace({ courseId });
      await startGameWithGyroCheck({
        mode: 'multi_host',
        courseId,
        vehicleKey,
        isHost: true
      });
    };

    // ゲスト: ルーム参加
    const btnJoin = modal.querySelector('#btn-join-room');
    btnJoin.onclick = async () => {
      const roomId = modal.querySelector('#input-room-id').value.trim();
      const vehicleKey = modal.querySelector('#select-guest-vehicle').value;
      if (!roomId) {
        alert('ルームIDを入力してください');
        return;
      }
      btnJoin.disabled = true;
      const statusEl = modal.querySelector('#guest-status');
      statusEl.classList.remove('hidden');
      statusEl.textContent = 'ホストに接続中...';

      try {
        await this.p2pManager.joinRoom(roomId, { vehicleKey });
        statusEl.textContent = '接続完了！ホストの開始を待機しています...';

        this.p2pManager.onGameStart = async (gameData) => {
          await startGameWithGyroCheck({
            mode: 'multi_guest',
            courseId: gameData.courseId,
            vehicleKey,
            isHost: false
          });
        };
      } catch (err) {
        alert('ルームへの接続に失敗しました: ' + err.message);
        btnJoin.disabled = false;
        statusEl.classList.add('hidden');
      }
    };

    // ソロプレイ開始
    modal.querySelector('#btn-start-solo').onclick = async () => {
      const courseId = modal.querySelector('#select-solo-course').value;
      const vehicleKey = modal.querySelector('#select-solo-vehicle').value;
      await startGameWithGyroCheck({
        mode: 'solo',
        courseId,
        vehicleKey,
        isHost: true
      });
    };
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      const tabJoin = this.modalEl.querySelector('#tab-join');
      tabJoin.click();
      this.modalEl.querySelector('#input-room-id').value = room;
    }
  }

  show() {
    this.modalEl.classList.remove('hidden');
  }

  hide() {
    this.modalEl.classList.add('hidden');
  }
}
