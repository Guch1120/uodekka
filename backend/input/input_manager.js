// backend/input/input_manager.js
// ジャイロセンサー、バーチャルスティック、タッチボタン、キーボード入力の統括 & UIレイアウト編集
import { Icons } from '../../frontend/icons/icons.js';

export class InputManager {
  constructor(container) {
    this.container = container;

    // 自動アクセル（デフォルト有効）
    const savedAutoAccel = localStorage.getItem('kart_auto_accelerate');
    this.autoAccelerate = savedAutoAccel !== null ? savedAutoAccel === 'true' : true;
    this._rawAccelerating = false;

    // アイテム長押しを開始した入力ソースの集合（'keyboard' / 'pointer'）。
    // キーボードとマウス/タッチが同時にアイテムを保持できるよう、
    // どちらか一方が離れただけでは発射させず、全ソースが離れたときだけ発射判定する。
    this._itemHeldSources = new Set();

    // 入力状態
    this.state = {
      steering: 0,        // -1.0 (左) 〜 +1.0 (右)
      braking: 0,         // 0.0 〜 1.0
      drift: false,       // ドリフト/ミニターボ
      itemHeld: false,    // アイテム長押し（後方保持）
      useItemTrigger: false, // アイテム離した瞬間の発射
      isForwardThrow: false, // 前方投げフラグ (長押し後リリース: 前方放物線 / 単押し: 後方設置)
      itemPressStartTime: 0
    };

    Object.defineProperty(this.state, 'accelerating', {
      get: () => {
        if (!this.canDrive()) return 0;
        if (this.state.braking > 0) return 0;
        if (this.autoAccelerate) return 1;
        return this._rawAccelerating ? 1 : 0;
      },
      set: (val) => {
        this._rawAccelerating = !!val;
      },
      configurable: true,
      enumerable: true
    });

    this._stickY = 0;
    Object.defineProperty(this.state, 'pitch', {
      get: () => {
        if (!this.canDrive()) return 0;
        if (this.keyboardKeys && (this.keyboardKeys['KeyW'] || this.keyboardKeys['ArrowUp'])) return 1.0;
        if (this.keyboardKeys && (this.keyboardKeys['KeyS'] || this.keyboardKeys['ArrowDown'])) return -1.0;
        if (this._stickY && Math.abs(this._stickY) > 0.2) return Math.sign(this._stickY) * Math.min(1.0, Math.abs(this._stickY));
        if (this.state.braking > 0) return -1.0;
        return 0;
      },
      configurable: true,
      enumerable: true
    });

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.controlMode = localStorage.getItem('kart_control_mode') || (isTouch ? 'gyro' : 'stick'); // PCは既定でstick
    this.gyroSensitivity = parseFloat(localStorage.getItem('kart_gyro_sens') || '0.7');
    // 直感的なステアリング操作（右傾けで右旋回）をデフォルトにするため、反転を初期値(true)に設定
    const savedInvert = localStorage.getItem('kart_invert_steer');
    this.invertSteering = savedInvert !== null ? savedInvert === 'true' : true;

    this.keyboardKeys = {};
    this.resetCallbacks = [];
    this.keyboardSteering = false;
    this.gyroGamma = 0;
    this.gyroActive = false;
    this.onEscape = null; // Escキー中断コールバック

    // スティックサイズ（80px〜200px, デフォルト 130px）
    this.stickSize = 130;
    // タップ位置追従（ダイナミック/フローティング）スティック設定（デフォルト有効）
    const savedDynamicStick = localStorage.getItem('kart_dynamic_stick');
    this.dynamicStickEnabled = savedDynamicStick !== null ? savedDynamicStick === 'true' : true;

    // 横画面基準のデフォルトUI配置レイアウト（ミニマップやスピードメーターと重複しない最適配置）
    this.defaultLayout = {
      stick: { left: '40px', bottom: '35px', size: '130px' },
      accel: { right: '35px', bottom: '35px', size: '95px' },
      brake: { right: '150px', bottom: '35px', size: '75px' },
      item: { right: '150px', bottom: '135px', size: '75px' }, // 左上から右側へ移動し、左上ミニマップとの重複を解消
      drift: { right: '55px', bottom: '150px', size: '75px' }
    };

    this.layout = this.loadLayout();
    this.isEditingLayout = false;

    this.initUI();
    this.bindKeyboardEvents();
    this.bindGyroEvents();
    this.bindOrientationChange();
  }

  loadLayout() {
    try {
      const saved = localStorage.getItem('kart_ui_layout');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.accelerator && !parsed.accel) {
          parsed.accel = parsed.accelerator;
          delete parsed.accelerator;
        }
        // 過去のキャッシュで左上ミニマップに重なる位置（top/left指定）がある場合は新配置へ移行
        if (parsed.item && (parsed.item.top || parsed.item.left)) {
          parsed.item = Object.assign({}, this.defaultLayout.item);
        }
        const layout = Object.assign({}, this.defaultLayout, parsed);
        if (layout.stick && layout.stick.size) {
          this.stickSize = parseInt(layout.stick.size, 10) || 130;
        }
        return layout;
      }
    } catch (e) {
      console.warn('Failed to parse saved layout', e);
    }
    this.stickSize = 130;
    return JSON.parse(JSON.stringify(this.defaultLayout));
  }

  saveLayout() {
    localStorage.setItem('kart_ui_layout', JSON.stringify(this.layout));
  }

  resetLayout() {
    this.layout = JSON.parse(JSON.stringify(this.defaultLayout));
    this.stickSize = 130;
    this.saveLayout();
    this.applyLayoutToElements();
  }

  setStickSize(size) {
    const s = Math.max(80, Math.min(200, Math.round(Number(size) || 130)));
    this.stickSize = s;
    if (!this.layout.stick) {
      this.layout.stick = Object.assign({}, this.defaultLayout.stick);
    }
    this.layout.stick.size = `${s}px`;
    this.saveLayout();
    const stickEl = document.getElementById('ctrl-stick');
    if (stickEl) {
      stickEl.style.width = `${s}px`;
      stickEl.style.height = `${s}px`;
    }
  }

  setDynamicStick(enabled) {
    this.dynamicStickEnabled = !!enabled;
    localStorage.setItem('kart_dynamic_stick', this.dynamicStickEnabled ? 'true' : 'false');
  }

  restoreStickHomePosition() {
    const stickEl = document.getElementById('ctrl-stick');
    if (!stickEl) return;
    const pos = this.layout.stick || this.defaultLayout.stick;
    stickEl.style.left = pos.left || 'auto';
    stickEl.style.right = pos.right || 'auto';
    stickEl.style.top = pos.top || 'auto';
    stickEl.style.bottom = pos.bottom || 'auto';
    const size = pos.size || `${this.stickSize}px`;
    stickEl.style.width = size;
    stickEl.style.height = size;
    stickEl.style.transform = 'translate(0px, 0px)';
    stickEl.style.transition = '';
    this.updateStickHomeCenter();
  }

  updateStickHomeCenter() {
    const stickEl = document.getElementById('ctrl-stick');
    if (!stickEl) return;
    const prevTransform = stickEl.style.transform;
    const prevTransition = stickEl.style.transition;
    stickEl.style.transform = 'none';
    stickEl.style.transition = 'none';
    const r = stickEl.getBoundingClientRect();
    this.stickHomeCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stickEl.style.transform = prevTransform;
    stickEl.style.transition = prevTransition;
  }

  setControlMode(mode) {
    this.controlMode = mode;
    localStorage.setItem('kart_control_mode', mode);
    this.updateStickVisibility();
  }

  setInvertSteering(invert) {
    this.invertSteering = invert;
    localStorage.setItem('kart_invert_steer', invert ? 'true' : 'false');
  }

  setAutoAccelerate(enabled) {
    this.autoAccelerate = !!enabled;
    localStorage.setItem('kart_auto_accelerate', this.autoAccelerate ? 'true' : 'false');
    this.updateAccelButtonVisibility();
  }

  updateAccelButtonVisibility() {
    const btnAccel = document.getElementById('ctrl-accel');
    if (btnAccel) {
      btnAccel.style.display = (this.autoAccelerate && !this.isEditingLayout) ? 'none' : 'flex';
    }
  }

  async requestGyroPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          this.gyroActive = true;
          return true;
        }
      } catch (e) {
        console.error('Gyro permission error:', e);
      }
      return false;
    } else if (window.DeviceOrientationEvent) {
      this.gyroActive = true;
      return true;
    }
    return false;
  }

  bindGyroEvents() {
    window.addEventListener('deviceorientation', (e) => {
      if (this.controlMode !== 'gyro' || !this.canDrive() || this.keyboardSteering) return;

      const orientationAngle = (screen.orientation && screen.orientation.angle !== undefined)
        ? screen.orientation.angle
        : (window.orientation || 0);

      let tiltAngle = 0;

      const isForcedLandscapeInPortrait = document.body.classList.contains('force-landscape') && (window.innerHeight > window.innerWidth);
      if (isForcedLandscapeInPortrait) {
        // 縦持ちロック状態で横持ちしている場合
        const isReverse = document.body.classList.contains('rotate-reverse');
        tiltAngle = isReverse ? e.beta : -e.beta;
      } else if (orientationAngle === 90) {
        tiltAngle = -e.beta;
      } else if (orientationAngle === -90 || orientationAngle === 270) {
        tiltAngle = e.beta;
      } else if (window.innerWidth > window.innerHeight) {
        tiltAngle = -e.beta;
      } else {
        tiltAngle = e.gamma;
      }

      if (tiltAngle !== null && tiltAngle !== undefined) {
        this.gyroActive = true;
        const deadZone = 2.0;
        const maxAngle = 26 / this.gyroSensitivity;

        if (Math.abs(tiltAngle) < deadZone) {
          this.state.steering = 0;
        } else {
          let steer = (tiltAngle - Math.sign(tiltAngle) * deadZone) / (maxAngle - deadZone);
          steer = Math.max(-1, Math.min(1, steer));
          if (this.invertSteering) steer = -steer;
          this.state.steering = steer;
        }
      }
    });
  }

  bindOrientationChange() {
    window.addEventListener('resize', () => {
      this.applyLayoutToElements();
    });
  }

  canDrive() {
    return !this.isEditingLayout && !this.controlsRoot.classList.contains('hidden') &&
      !document.querySelector('.modal-backdrop:not(.hidden)');
  }

  // アイテム長押しの開始をソースごとに記録する。既に他ソースが保持中なら
  // 持続時間の基準時刻(itemPressStartTime)は上書きしない（同時押しで最初の保持を優先）。
  _beginItemHold(source) {
    const wasHeld = this._itemHeldSources.size > 0;
    this._itemHeldSources.add(source);
    if (!wasHeld) {
      this.state.itemHeld = true;
      this.state.itemPressStartTime = performance.now();
    }
  }

  // アイテム長押しの終了をソースごとに記録する。このソースが保持していなかった場合は
  // 何もしない（＝他ソースの保持中に無関係な入力で誤発射させないための要）。
  // 全ソースが離れたときだけ実際に発射判定を行う。
  _endItemHold(source) {
    if (!this._itemHeldSources.has(source)) return;
    this._itemHeldSources.delete(source);
    if (this._itemHeldSources.size === 0) {
      const duration = performance.now() - this.state.itemPressStartTime;
      this.state.isForwardThrow = duration >= 250; // 250ms以上押し続けて離したら前方投げ
      this.state.itemHeld = false;
      this.state.useItemTrigger = true; // 離した瞬間に使用
    }
  }

  resetState() {
    // キー解放を受け取れない中断でも、入力と発射予約を持ち越さない。
    this.keyboardKeys = {};
    this.keyboardSteering = false;
    this._stickY = 0;
    this._itemHeldSources.clear();
    Object.assign(this.state, {
      steering: 0, accelerating: 0, braking: 0, drift: false,
      itemHeld: false, useItemTrigger: false, isForwardThrow: false,
      itemPressStartTime: 0
    });
    this.controlsRoot.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed'));
    this.resetCallbacks.forEach(reset => reset());
  }

  bindKeyboardEvents() {
    const gameKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyQ', 'Enter', 'Escape']);

    const normalizeCode = (e) => {
      if (gameKeys.has(e.code)) return e.code;
      const k = e.key ? e.key.toLowerCase() : '';
      if (k === 'w') return 'KeyW';
      if (k === 'a') return 'KeyA';
      if (k === 's') return 'KeyS';
      if (k === 'd') return 'KeyD';
      if (k === 'e') return 'KeyE';
      if (k === 'q') return 'KeyQ';
      if (k === ' ') return 'Space';
      if (k === 'escape') return 'Escape';
      return e.code;
    };

    window.addEventListener('keydown', (e) => {
      const code = normalizeCode(e);

      // Escapeキーによる一時中断・ポーズ切替
      if (code === 'Escape') {
        if (!e.target.closest?.('input, textarea, select, [contenteditable="true"]')) {
          e.preventDefault();
          if (this.onEscape) {
            this.onEscape();
          }
          return;
        }
      }

      if (!gameKeys.has(code) || !this.canDrive() ||
          e.target.closest?.('input, textarea, select, button, [contenteditable="true"]') ||
          e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      this.keyboardKeys[code] = true;
      this.updateKeyboardState(this.keyboardKeys);
    });
    window.addEventListener('keyup', (e) => {
      const code = normalizeCode(e);
      if (!this.keyboardKeys[code]) return;
      delete this.keyboardKeys[code];
      if (!this.canDrive()) { this.resetState(); return; }
      this.updateKeyboardState(this.keyboardKeys);
    });
    window.addEventListener('blur', () => this.resetState());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetState();
    });
  }

  updateKeyboardState(keys) {
    let steer = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) steer -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) steer += 1;
    // キーボードはセンサー反転設定に関係なく、矢印の方向へ旋回する。

    if (steer !== 0 || this.keyboardSteering || this.controlMode !== 'gyro') {
      this.state.steering = steer;
    }

    this.keyboardSteering = steer !== 0;

    this.state.accelerating = (keys['ArrowUp'] || keys['KeyW']) ? 1 : 0;
    this.state.braking = (keys['ArrowDown'] || keys['KeyS']) ? 1 : 0;
    this.state.drift = !!keys['ShiftLeft'] || !!keys['ShiftRight'] || !!keys['Space'];

    // キーボードのアイテム長押し判定 (E/Q/Enter)
    // マウス/タッチによる保持と独立管理し、片方の入力で他方の保持を誤って発射させない。
    const itemKey = keys['KeyE'] || keys['KeyQ'] || keys['Enter'];
    if (itemKey) {
      this._beginItemHold('keyboard');
    } else {
      this._endItemHold('keyboard');
    }
  }

  initUI() {
    const root = document.createElement('div');
    root.id = 'touch-controls-container';
    root.className = 'touch-controls-layer hidden';

    const stickContainer = document.createElement('div');
    stickContainer.id = 'ctrl-stick';
    stickContainer.className = 'touch-control-element stick-base';
    stickContainer.innerHTML = '<div class="stick-knob" id="stick-knob"></div>';
    root.appendChild(stickContainer);

    const btnAccel = document.createElement('button');
    btnAccel.id = 'ctrl-accel';
    btnAccel.className = 'touch-control-element touch-btn btn-gas';
    btnAccel.innerHTML = '<span>アクセル<br><small>GO</small></span>';
    root.appendChild(btnAccel);

    const btnBrake = document.createElement('button');
    btnBrake.id = 'ctrl-brake';
    btnBrake.className = 'touch-control-element touch-btn btn-brake';
    btnBrake.innerHTML = '<span>ブレーキ</span>';
    root.appendChild(btnBrake);

    const btnItem = document.createElement('button');
    btnItem.id = 'ctrl-item';
    btnItem.className = 'touch-control-element touch-btn btn-item';
    btnItem.innerHTML = '<span>アイテム<br><small>長押し保持</small></span>';
    root.appendChild(btnItem);

    const btnDrift = document.createElement('button');
    btnDrift.id = 'ctrl-drift';
    btnDrift.className = 'touch-control-element touch-btn btn-drift';
    btnDrift.innerHTML = '<span>ドリフト</span>';
    root.appendChild(btnDrift);

    this.container.appendChild(root);
    this.controlsRoot = root;

    this.applyLayoutToElements();
    this.bindTouchControls();
    this.updateStickVisibility();
    this.updateAccelButtonVisibility();
  }

  applyLayoutToElements() {
    for (const [key, pos] of Object.entries(this.layout)) {
      const el = document.getElementById(`ctrl-${key}`);
      if (!el) continue;
      el.style.left = pos.left || 'auto';
      el.style.right = pos.right || 'auto';
      el.style.top = pos.top || 'auto';
      el.style.bottom = pos.bottom || 'auto';
      if (pos.size) {
        el.style.width = pos.size;
        el.style.height = pos.size;
      }
    }
  }

  updateStickVisibility() {
    const stickEl = document.getElementById('ctrl-stick');
    if (stickEl) {
      stickEl.style.display = (this.controlMode === 'stick' || this.isEditingLayout) ? 'flex' : 'none';
    }
  }

  bindTouchControls() {
    const btnAccel = document.getElementById('ctrl-accel');
    const btnBrake = document.getElementById('ctrl-brake');
    const btnItem = document.getElementById('ctrl-item');
    const btnDrift = document.getElementById('ctrl-drift');
    const stickBase = document.getElementById('ctrl-stick');
    const stickKnob = document.getElementById('stick-knob');

    const bindPress = (el, onDown, onUp) => {
      let activePointer = null;
      el.addEventListener('pointerdown', (e) => {
        if (!this.canDrive() || activePointer !== null || e.button !== 0) return;
        e.preventDefault();
        activePointer = e.pointerId;
        el.setPointerCapture(e.pointerId);
        onDown();
      });
      el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== activePointer) return;
        activePointer = null;
        e.preventDefault();
        onUp();
      });
      const cancel = (e) => {
        if (e.pointerId === activePointer) this.resetState();
      };
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('lostpointercapture', cancel);
      this.resetCallbacks.push(() => { activePointer = null; });
    };

    // アクセル
    bindPress(btnAccel,
      () => { this.state.accelerating = 1; btnAccel.classList.add('pressed'); },
      () => { this.state.accelerating = 0; btnAccel.classList.remove('pressed'); }
    );

    // ブレーキ
    bindPress(btnBrake,
      () => { this.state.braking = 1; btnBrake.classList.add('pressed'); },
      () => { this.state.braking = 0; btnBrake.classList.remove('pressed'); }
    );

    // ドリフト
    bindPress(btnDrift,
      () => { this.state.drift = true; btnDrift.classList.add('pressed'); },
      () => { this.state.drift = false; btnDrift.classList.remove('pressed'); }
    );

    // アイテム（長押しで後方保持、離した瞬間に使用。単押し=後方、長押し保持後リリース=前方投げ）
    // キーボードによる保持と独立管理し、片方の入力で他方の保持を誤って発射させない。
    bindPress(btnItem,
      () => {
        this._beginItemHold('pointer');
        btnItem.classList.add('pressed');
      },
      () => {
        this._endItemHold('pointer');
        btnItem.classList.remove('pressed');
      }
    );

    // スティックのドラッグ操作 (dxがプラスなら右旋回: steer = +dx / maxRadius)
    let stickTouchId = null;
    let stickRect = null;
    let stickOrigin = null;
    let isStickShifted = false;

    const handleStickMove = (clientX, clientY) => {
      if (!stickRect || !stickOrigin) return;
      const maxRadius = stickRect.width / 2;

      let dx = clientX - stickOrigin.x;
      let dy = clientY - stickOrigin.y;

      // CSSによる90度強制横持ちモードの場合（縦画面ロック時のみ）、タッチ座標系を要素ローカル系に合わせて変換
      const isForcedLandscapeInPortrait = document.body.classList.contains('force-landscape') && (window.innerHeight > window.innerWidth);
      if (isForcedLandscapeInPortrait) {
        const isReverse = document.body.classList.contains('rotate-reverse');
        const tempX = dx;
        if (isReverse) {
          // -90度回転の場合
          dx = -dy;
          dy = tempX;
        } else {
          // +90度回転の場合
          dx = dy;
          dy = -tempX;
        }
      }

      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      // 右に倒したら dx > 0 なので steer > 0（右旋回）
      let steer = dx / maxRadius;
      if (!this.invertSteering) steer = -steer;
      this.state.steering = steer;
      // 前に倒したら dy < 0 なので _stickY > 0 (前入力)
      this._stickY = -dy / maxRadius;
    };

    const handleStickEnd = () => {
      stickTouchId = null;
      stickKnob.style.transform = 'translate(0px, 0px)';
      this._stickY = 0;
      if (this.controlMode === 'stick') {
        this.state.steering = 0;
      }
      if (this.dynamicStickEnabled && isStickShifted) {
        isStickShifted = false;
        stickBase.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
        stickBase.style.transform = 'translate(0px, 0px)';
        setTimeout(() => {
          if (!isStickShifted) stickBase.style.transition = '';
        }, 250);
      }
      stickOrigin = null;
      stickRect = null;
    };

    this.resetCallbacks.push(handleStickEnd);
    window.addEventListener('touchcancel', () => this.resetState());

    // スティックエリア判定 (画面左半分 & 画面下部75%エリア)
    const checkInStickArea = (clientX, clientY) => {
      const isForcedLandscapeInPortrait = document.body.classList.contains('force-landscape') && (window.innerHeight > window.innerWidth);
      if (isForcedLandscapeInPortrait) {
        const isReverse = document.body.classList.contains('rotate-reverse');
        const localX = isReverse ? (window.innerHeight - clientY) : clientY;
        const localY = isReverse ? clientX : (window.innerWidth - clientX);
        const rootW = window.innerHeight;
        const rootH = window.innerWidth;
        return localX < rootW * 0.5 && localY > rootH * 0.25;
      }
      return clientX < window.innerWidth * 0.5 && clientY > window.innerHeight * 0.25;
    };

    // スティック要素自体への直接タッチ
    stickBase.addEventListener('touchstart', (e) => {
      if (!this.canDrive() || this.isEditingLayout) return;
      if (this.controlMode !== 'stick') return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.changedTouches[0];
      stickTouchId = touch.identifier;
      stickRect = stickBase.getBoundingClientRect();
      stickOrigin = { x: stickRect.left + stickRect.width / 2, y: stickRect.top + stickRect.height / 2 };
      handleStickMove(touch.clientX, touch.clientY);
    }, { passive: false });

    // スティックエリア内（スティックからズレた位置含む）へのタッチ（タップ追従スティック）
    window.addEventListener('touchstart', (e) => {
      if (!this.canDrive() || this.isEditingLayout) return;
      if (this.controlMode !== 'stick') return;
      if (stickTouchId !== null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        // 除外するUI: ポーズ、設定、音量、ミニマップ、HUDボタンなど
        if (target && target.closest('button, input, select, textarea, .modal-backdrop, #btn-open-pause, #btn-open-settings, #btn-mute-audio, .hud-top-right, .hud-top-center, .hud-pause-btn')) {
          continue;
        }

        const isDirectStick = !!(target && target.closest('#ctrl-stick'));
        const inStickArea = checkInStickArea(touch.clientX, touch.clientY);

        if (isDirectStick || inStickArea) {
          e.preventDefault();
          stickTouchId = touch.identifier;

          if (!isDirectStick && this.dynamicStickEnabled) {
            this.updateStickHomeCenter();
            isStickShifted = true;
            stickBase.style.transition = 'none';
            const shiftX = touch.clientX - this.stickHomeCenter.x;
            const shiftY = touch.clientY - this.stickHomeCenter.y;
            stickBase.style.transform = `translate(${shiftX}px, ${shiftY}px)`;

            stickRect = stickBase.getBoundingClientRect();
            stickOrigin = { x: touch.clientX, y: touch.clientY };
            handleStickMove(touch.clientX, touch.clientY);
          } else {
            stickRect = stickBase.getBoundingClientRect();
            stickOrigin = { x: stickRect.left + stickRect.width / 2, y: stickRect.top + stickRect.height / 2 };
            handleStickMove(touch.clientX, touch.clientY);
          }
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isEditingLayout || stickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === stickTouchId) {
          handleStickMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (this.isEditingLayout || stickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === stickTouchId) {
          handleStickEnd();
          break;
        }
      }
    });

    // マウスでのスティック操作対応（PC実機検証・デバッグ用）
    let isMouseDownStick = false;
    stickBase.addEventListener('mousedown', (e) => {
      if (!this.canDrive() || this.isEditingLayout || e.button !== 0) return;
      if (this.controlMode !== 'stick') return;
      e.preventDefault();
      e.stopPropagation();
      isMouseDownStick = true;
      stickRect = stickBase.getBoundingClientRect();
      stickOrigin = { x: stickRect.left + stickRect.width / 2, y: stickRect.top + stickRect.height / 2 };
      handleStickMove(e.clientX, e.clientY);
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.canDrive() || this.isEditingLayout || e.button !== 0) return;
      if (this.controlMode !== 'stick') return;
      if (stickTouchId !== null || isMouseDownStick) return;

      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && target.closest('button, input, select, textarea, .modal-backdrop, #btn-open-pause, #btn-open-settings, #btn-mute-audio, .hud-top-right, .hud-top-center, .hud-pause-btn')) {
        return;
      }

      const isDirectStick = !!(target && target.closest('#ctrl-stick'));
      const inStickArea = checkInStickArea(e.clientX, e.clientY);

      if (isDirectStick || inStickArea) {
        e.preventDefault();
        isMouseDownStick = true;

        if (!isDirectStick && this.dynamicStickEnabled) {
          this.updateStickHomeCenter();
          isStickShifted = true;
          stickBase.style.transition = 'none';
          const shiftX = e.clientX - this.stickHomeCenter.x;
          const shiftY = e.clientY - this.stickHomeCenter.y;
          stickBase.style.transform = `translate(${shiftX}px, ${shiftY}px)`;

          stickRect = stickBase.getBoundingClientRect();
          stickOrigin = { x: e.clientX, y: e.clientY };
          handleStickMove(e.clientX, e.clientY);
        } else {
          stickRect = stickBase.getBoundingClientRect();
          stickOrigin = { x: stickRect.left + stickRect.width / 2, y: stickRect.top + stickRect.height / 2 };
          handleStickMove(e.clientX, e.clientY);
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDownStick || this.isEditingLayout) return;
      handleStickMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (isMouseDownStick) {
        isMouseDownStick = false;
        handleStickEnd();
      }
    });

    this.resetCallbacks.push(() => {
      if (isMouseDownStick) {
        isMouseDownStick = false;
        handleStickEnd();
      }
    });

    const accelTouches = new Set();
    this.resetCallbacks.push(() => accelTouches.clear());
    window.addEventListener('touchstart', (e) => {
      if (!this.canDrive()) return;
      const touch = e.changedTouches[0];
      if (touch.clientX > window.innerWidth * 0.55 && touch.clientY > window.innerHeight * 0.3) {
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target?.tagName === 'CANVAS' && target.parentElement === this.container) {
          accelTouches.add(touch.identifier);
          this.state.accelerating = 1;
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (this.isEditingLayout) return;
      for (const touch of e.changedTouches) accelTouches.delete(touch.identifier);
      if (accelTouches.size === 0) {
        if (!btnAccel.classList.contains('pressed') && !this.keyboardKeys.KeyW && !this.keyboardKeys.ArrowUp) {
          this.state.accelerating = 0;
        }
      }
    });
  }

  startLayoutCustomization() {
    this.resetState();
    // ロビー/コース選択画面など、レース外から開いた場合はボタン群が非表示のままなので、
    // 編集中だけ強制的に表示し、終了時に元の表示状態へ戻す。
    this._layoutEditWasHidden = this.controlsRoot.classList.contains('hidden');
    this.showControls();
    this.isEditingLayout = true;
    this.controlsRoot.classList.add('customizing-layout');
    this.updateStickVisibility();
    this.updateAccelButtonVisibility();

    const bar = document.createElement('div');
    bar.id = 'layout-edit-banner';
    bar.className = 'layout-edit-banner';
    bar.innerHTML = `
      <div class="layout-banner-content">
        <span class="layout-banner-title">ボタンをドラッグして好きな位置に配置してください</span>
        <div class="layout-stick-size-control">
          <span>スティックサイズ:</span>
          <input type="range" id="layout-stick-size-slider" min="80" max="200" step="5" value="${this.stickSize}">
          <span id="layout-stick-size-val">${this.stickSize}px</span>
        </div>
      </div>
      <button id="btn-save-layout" class="primary-btn">配置を保存して終了</button>
    `;
    document.body.appendChild(bar);

    const layoutStickSlider = bar.querySelector('#layout-stick-size-slider');
    const layoutStickVal = bar.querySelector('#layout-stick-size-val');
    if (layoutStickSlider) {
      layoutStickSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (layoutStickVal) layoutStickVal.textContent = `${val}px`;
        this.setStickSize(val);
      };
    }

    const keys = ['stick', 'accel', 'brake', 'item', 'drift'];
    const cleanupFns = [];

    keys.forEach(k => {
      const el = document.getElementById(`ctrl-${k}`);
      if (!el) return;

      el.classList.add('draggable-target');

      let startX, startY, initialLeft, initialTop;

      const onPointerDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const rect = el.getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        initialLeft = rect.left;
        initialTop = rect.top;

        const onPointerMove = (moveEvt) => {
          const moveX = moveEvt.touches ? moveEvt.touches[0].clientX : moveEvt.clientX;
          const moveY = moveEvt.touches ? moveEvt.touches[0].clientY : moveEvt.clientY;
          const nLeft = initialLeft + (moveX - startX);
          const nTop = initialTop + (moveY - startY);

          el.style.left = `${Math.max(10, Math.min(window.innerWidth - rect.width - 10, nLeft))}px`;
          el.style.top = `${Math.max(10, Math.min(window.innerHeight - rect.height - 10, nTop))}px`;
          el.style.right = 'auto';
          el.style.bottom = 'auto';
        };

        const onPointerUp = () => {
          window.removeEventListener('mousemove', onPointerMove);
          window.removeEventListener('mouseup', onPointerUp);
          window.removeEventListener('touchmove', onPointerMove);
          window.removeEventListener('touchend', onPointerUp);

          this.layout[k] = {
            left: el.style.left,
            top: el.style.top,
            size: el.style.width || this.defaultLayout[k]?.size
          };
        };

        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerUp);
      };

      el.addEventListener('mousedown', onPointerDown);
      el.addEventListener('touchstart', onPointerDown, { passive: false });

      cleanupFns.push(() => {
        el.removeEventListener('mousedown', onPointerDown);
        el.removeEventListener('touchstart', onPointerDown);
        el.classList.remove('draggable-target');
      });
    });

    document.getElementById('btn-save-layout').onclick = () => {
      this.saveLayout();
      this.isEditingLayout = false;
      this.controlsRoot.classList.remove('customizing-layout');
      bar.remove();
      cleanupFns.forEach(fn => fn());
      if (this._layoutEditWasHidden) {
        this.hideControls();
      } else {
        this.updateStickVisibility();
        this.updateAccelButtonVisibility();
      }
    };
  }

  showControls() {
    if (this.controlsRoot) {
      this.controlsRoot.classList.remove('hidden');
      this.updateStickVisibility();
      this.updateAccelButtonVisibility();
    }
  }

  hideControls() {
    this.resetState();
    if (this.controlsRoot) {
      this.controlsRoot.classList.add('hidden');
    }
  }
}
