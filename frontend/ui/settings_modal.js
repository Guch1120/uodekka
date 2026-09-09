// frontend/ui/settings_modal.js
// 操作方法設定（ジャイロ vs スティック）、左右ハンドル反転、ボタン配置カスタマイズ
import { Icons } from '../icons/icons.js';

export class SettingsModal {
  constructor(container, inputManager) {
    this.container = container;
    this.inputManager = inputManager;
    this.modalEl = null;
    this.isEditLayoutMode = false;
    this.init();
  }

  init() {
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h2>ゲーム・操作設定</h2>
          <button class="btn-close" id="btn-close-settings">×</button>
        </div>
        <div class="modal-body">
          <div class="setting-row">
            <div class="setting-label">
              <strong>ステアリング操作モード</strong>
              <div class="subtext">ジャイロ傾き操作、または画面左のバーチャルスティック</div>
            </div>
            <div class="toggle-group">
              <button id="btn-mode-gyro" class="toggle-btn active">
                ${Icons.getSvg('gyro')}
                <span>ジャイロ</span>
              </button>
              <button id="btn-mode-stick" class="toggle-btn">
                ${Icons.getSvg('steering_wheel')}
                <span>スティック</span>
              </button>
            </div>
          </div>

          <div class="setting-row" id="stick-size-setting-row">
            <div class="setting-label">
              <strong>スティックの大きさ</strong>
              <div class="subtext">画面左のバーチャルスティックの直径（80px〜200px）</div>
            </div>
            <div class="slider-group">
              <input type="range" id="input-stick-size" min="80" max="200" step="5" value="130">
              <span id="label-stick-size-val" class="slider-value-badge">130px</span>
            </div>
          </div>

          <div class="setting-row" id="dynamic-stick-setting-row">
            <div class="setting-label">
              <strong>タップ追従スティック</strong>
              <div class="subtext">画面左下をタップした位置を原点としてスティックを表示・操作</div>
            </div>
            <div class="toggle-group">
              <button id="btn-dynamic-stick-on" class="toggle-btn active">ON (推奨)</button>
              <button id="btn-dynamic-stick-off" class="toggle-btn">固定位置</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <strong>自動アクセル</strong>
              <div class="subtext">前進アクセルを自動で行います（OFFで手動ボタン操作）</div>
            </div>
            <div class="toggle-group">
              <button id="btn-auto-accel-on" class="toggle-btn active">ON (推奨)</button>
              <button id="btn-auto-accel-off" class="toggle-btn">OFF</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <strong>ハンドル操作の向き（左右反転）</strong>
              <div class="subtext">右に傾けた/倒したときの旋回方向（直感的な向きが推奨です）</div>
            </div>
            <div class="toggle-group">
              <button id="btn-steer-inverted" class="toggle-btn active">直感的 (推奨)</button>
              <button id="btn-steer-normal" class="toggle-btn">リバース</button>
            </div>
          </div>

          <div class="setting-row" id="gyro-permission-row">
            <div class="setting-label">
              <strong>ジャイロセンサー許可 (iOS/一部Android)</strong>
              <div class="subtext">スマホを傾けて操作するためのアクセス権を有効化</div>
            </div>
            <button id="btn-request-gyro" class="primary-btn">ジャイロを有効化</button>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <strong>ジャイロ感度</strong>
              <div class="subtext">傾きの反応の強さ</div>
            </div>
            <input type="range" id="input-gyro-sens" min="0.2" max="2.0" step="0.1" value="0.7">
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <strong>ボタン配置カスタマイズ</strong>
              <div class="subtext">アクセル、ブレーキ、アイテム、スティックの位置を画面上で自由に変更</div>
            </div>
            <button id="btn-edit-layout" class="action-btn">レイアウト変更モード開始</button>
          </div>

          <div class="setting-row">
            <button id="btn-reset-layout" class="btn-secondary">ボタン位置を初期状態に戻す</button>
          </div>
        </div>
        <div class="modal-footer">
          <button id="btn-save-settings" class="primary-btn">完了</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);
    this.modalEl = modal;

    this.bindEvents();
  }

  bindEvents() {
    const modal = this.modalEl;
    const btnClose = modal.querySelector('#btn-close-settings');
    const btnSave = modal.querySelector('#btn-save-settings');
    const btnGyro = modal.querySelector('#btn-mode-gyro');
    const btnStick = modal.querySelector('#btn-mode-stick');
    const btnSteerNormal = modal.querySelector('#btn-steer-normal');
    const btnSteerInverted = modal.querySelector('#btn-steer-inverted');
    const btnRequestGyro = modal.querySelector('#btn-request-gyro');
    const inputSens = modal.querySelector('#input-gyro-sens');
    const btnEditLayout = modal.querySelector('#btn-edit-layout');
    const btnResetLayout = modal.querySelector('#btn-reset-layout');

    const inputStickSize = modal.querySelector('#input-stick-size');
    const labelStickSizeVal = modal.querySelector('#label-stick-size-val');
    const btnDynamicStickOn = modal.querySelector('#btn-dynamic-stick-on');
    const btnDynamicStickOff = modal.querySelector('#btn-dynamic-stick-off');

    const btnAutoAccelOn = modal.querySelector('#btn-auto-accel-on');
    const btnAutoAccelOff = modal.querySelector('#btn-auto-accel-off');

    btnClose.onclick = () => this.hide();
    btnSave.onclick = () => this.hide();

    inputStickSize.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      labelStickSizeVal.textContent = `${val}px`;
      this.inputManager.setStickSize(val);
    };

    btnDynamicStickOn.onclick = () => {
      btnDynamicStickOn.classList.add('active');
      btnDynamicStickOff.classList.remove('active');
      this.inputManager.setDynamicStick(true);
    };

    btnDynamicStickOff.onclick = () => {
      btnDynamicStickOff.classList.add('active');
      btnDynamicStickOn.classList.remove('active');
      this.inputManager.setDynamicStick(false);
    };

    btnAutoAccelOn.onclick = () => {
      btnAutoAccelOn.classList.add('active');
      btnAutoAccelOff.classList.remove('active');
      this.inputManager.setAutoAccelerate(true);
    };

    btnAutoAccelOff.onclick = () => {
      btnAutoAccelOff.classList.add('active');
      btnAutoAccelOn.classList.remove('active');
      this.inputManager.setAutoAccelerate(false);
    };

    btnGyro.onclick = () => {
      btnGyro.classList.add('active');
      btnStick.classList.remove('active');
      this.inputManager.setControlMode('gyro');
    };

    btnStick.onclick = () => {
      btnStick.classList.add('active');
      btnGyro.classList.remove('active');
      this.inputManager.setControlMode('stick');
    };

    btnSteerNormal.onclick = () => {
      btnSteerNormal.classList.add('active');
      btnSteerInverted.classList.remove('active');
      this.inputManager.setInvertSteering(false);
    };

    btnSteerInverted.onclick = () => {
      btnSteerInverted.classList.add('active');
      btnSteerNormal.classList.remove('active');
      this.inputManager.setInvertSteering(true);
    };

    btnRequestGyro.onclick = async () => {
      const granted = await this.inputManager.requestGyroPermission();
      btnRequestGyro.textContent = granted ? '許可済み ✓' : '利用不可/拒否';
      if (granted) btnRequestGyro.disabled = true;
    };

    inputSens.oninput = (e) => {
      this.inputManager.gyroSensitivity = parseFloat(e.target.value);
    };

    btnEditLayout.onclick = () => {
      this.hide();
      this.inputManager.startLayoutCustomization();
    };

    btnResetLayout.onclick = () => {
      this.inputManager.resetLayout();
      if (inputStickSize) inputStickSize.value = 130;
      if (labelStickSizeVal) labelStickSizeVal.textContent = '130px';
      alert('ボタン配置を初期状態に戻しました。');
    };
  }

  show() {
    this.modalEl.classList.remove('hidden');
    const mode = this.inputManager.controlMode;
    const btnGyro = this.modalEl.querySelector('#btn-mode-gyro');
    const btnStick = this.modalEl.querySelector('#btn-mode-stick');
    if (mode === 'gyro') {
      btnGyro.classList.add('active');
      btnStick.classList.remove('active');
    } else {
      btnStick.classList.add('active');
      btnGyro.classList.remove('active');
    }

    const stickSize = this.inputManager.stickSize || 130;
    const inputStickSize = this.modalEl.querySelector('#input-stick-size');
    const labelStickSizeVal = this.modalEl.querySelector('#label-stick-size-val');
    if (inputStickSize) inputStickSize.value = stickSize;
    if (labelStickSizeVal) labelStickSizeVal.textContent = `${stickSize}px`;

    const isDynamic = this.inputManager.dynamicStickEnabled !== false;
    const btnDynamicStickOn = this.modalEl.querySelector('#btn-dynamic-stick-on');
    const btnDynamicStickOff = this.modalEl.querySelector('#btn-dynamic-stick-off');
    if (btnDynamicStickOn && btnDynamicStickOff) {
      if (isDynamic) {
        btnDynamicStickOn.classList.add('active');
        btnDynamicStickOff.classList.remove('active');
      } else {
        btnDynamicStickOff.classList.add('active');
        btnDynamicStickOn.classList.remove('active');
      }
    }

    const isInverted = this.inputManager.invertSteering;
    const btnNorm = this.modalEl.querySelector('#btn-steer-normal');
    const btnInv = this.modalEl.querySelector('#btn-steer-inverted');
    if (isInverted) {
      btnInv.classList.add('active');
      btnNorm.classList.remove('active');
    } else {
      btnNorm.classList.add('active');
      btnInv.classList.remove('active');
    }

    const isAutoAccel = this.inputManager.autoAccelerate;
    const btnAutoAccelOn = this.modalEl.querySelector('#btn-auto-accel-on');
    const btnAutoAccelOff = this.modalEl.querySelector('#btn-auto-accel-off');
    if (isAutoAccel) {
      btnAutoAccelOn.classList.add('active');
      btnAutoAccelOff.classList.remove('active');
    } else {
      btnAutoAccelOff.classList.add('active');
      btnAutoAccelOn.classList.remove('active');
    }
  }

  hide() {
    this.modalEl.classList.add('hidden');
  }
}
