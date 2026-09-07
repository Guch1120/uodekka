// backend/input/input_manager.js
// ジャイロセンサー、バーチャルスティック、タッチボタン、キーボード入力の統括 & UIレイアウト編集
import { Icons } from '../../frontend/icons/icons.js';

export class InputManager {
  constructor(container) {
    this.container = container;

    // 入力状態
    this.state = {
      steering: 0,        // -1.0 (左) 〜 +1.0 (右)
      accelerating: 0,    // 0.0 〜 1.0
      braking: 0,         // 0.0 〜 1.0
      drift: false,       // ドリフト/ミニターボ
      itemHeld: false,    // アイテム長押し（後方保持）
      useItemTrigger: false, // アイテム離した瞬間の発射
      isForwardThrow: false, // 前方投げフラグ (長押し後リリース: 前方放物線 / 単押し: 後方設置)
      itemPressStartTime: 0
    };

    this.controlMode = localStorage.getItem('kart_control_mode') || 'gyro'; // 'gyro' or 'stick'
    this.gyroSensitivity = parseFloat(localStorage.getItem('kart_gyro_sens') || '0.7');
    this.invertSteering = localStorage.getItem('kart_invert_steer') === 'true'; // ハンドル反転設定

    this.gyroGamma = 0;
    this.gyroActive = false;

    // 横画面基準のデフォルトUI配置レイアウト
    this.defaultLayout = {
      stick: { left: '40px', bottom: '35px', size: '130px' },
      accel: { right: '40px', bottom: '35px', size: '95px' },
      brake: { right: '155px', bottom: '35px', size: '75px' },
      item: { left: '40px', top: '100px', size: '75px' },
      drift: { right: '65px', bottom: '150px', size: '75px' }
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
        return Object.assign({}, this.defaultLayout, parsed);
      }
    } catch (e) {
      console.warn('Failed to parse saved layout', e);
    }
    return JSON.parse(JSON.stringify(this.defaultLayout));
  }

  saveLayout() {
    localStorage.setItem('kart_ui_layout', JSON.stringify(this.layout));
  }

  resetLayout() {
    this.layout = JSON.parse(JSON.stringify(this.defaultLayout));
    this.saveLayout();
    this.applyLayoutToElements();
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
      if (this.controlMode !== 'gyro') return;

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

  bindKeyboardEvents() {
    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      this.updateKeyboardState(keys);
    });

    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
      this.updateKeyboardState(keys);
    });
  }

  updateKeyboardState(keys) {
    let steer = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) steer -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) steer += 1;
    if (this.invertSteering && steer !== 0) steer = -steer;

    if (steer !== 0 || this.controlMode !== 'gyro') {
      this.state.steering = steer;
    }

    this.state.accelerating = (keys['ArrowUp'] || keys['KeyW']) ? 1 : 0;
    this.state.braking = (keys['ArrowDown'] || keys['KeyS']) ? 1 : 0;
    this.state.drift = !!keys['ShiftLeft'] || !!keys['ShiftRight'] || !!keys['Space'];

    // キーボードのアイテム長押し判定 (E/Q/Enter)
    const itemKey = keys['KeyE'] || keys['KeyQ'] || keys['Enter'];
    if (itemKey && !this.state.itemHeld) {
      this.state.itemHeld = true;
      this.state.itemPressStartTime = performance.now();
    } else if (!itemKey && this.state.itemHeld) {
      const duration = performance.now() - this.state.itemPressStartTime;
      this.state.isForwardThrow = duration >= 250; // 250ms以上押し続けて離したら前方投げ
      this.state.itemHeld = false;
      this.state.useItemTrigger = true; // 離した瞬間に使用
    }
  }

  initUI() {
    const root = document.createElement('div');
    root.id = 'touch-controls-container';
    root.className = 'touch-controls-layer';

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
      const handleDown = (e) => {
        if (this.isEditingLayout) return;
        e.preventDefault();
        onDown();
      };
      const handleUp = (e) => {
        if (this.isEditingLayout) return;
        e.preventDefault();
        onUp();
      };

      el.addEventListener('touchstart', handleDown, { passive: false });
      el.addEventListener('touchend', handleUp, { passive: false });
      el.addEventListener('mousedown', handleDown);
      window.addEventListener('mouseup', handleUp);
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
    bindPress(btnItem,
      () => {
        this.state.itemHeld = true;
        this.state.itemPressStartTime = performance.now();
        btnItem.classList.add('pressed');
      },
      () => {
        if (this.state.itemHeld) {
          const duration = performance.now() - this.state.itemPressStartTime;
          this.state.isForwardThrow = duration >= 250; // 250ms以上保持して離したら前方投げ、短ければ後方
          this.state.itemHeld = false;
          this.state.useItemTrigger = true;
        }
        btnItem.classList.remove('pressed');
      }
    );

    // スティックのドラッグ操作 (dxがプラスなら右旋回: steer = +dx / maxRadius)
    let stickTouchId = null;
    let stickRect = null;

    const handleStickMove = (clientX, clientY) => {
      if (!stickRect) return;
      const centerX = stickRect.left + stickRect.width / 2;
      const centerY = stickRect.top + stickRect.height / 2;
      const maxRadius = stickRect.width / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;

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
      if (this.invertSteering) steer = -steer;
      this.state.steering = steer;
    };

    const handleStickEnd = () => {
      stickTouchId = null;
      stickKnob.style.transform = `translate(0px, 0px)`;
      if (this.controlMode === 'stick') {
        this.state.steering = 0;
      }
    };

    stickBase.addEventListener('touchstart', (e) => {
      if (this.isEditingLayout) return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      stickTouchId = touch.identifier;
      stickRect = stickBase.getBoundingClientRect();
      handleStickMove(touch.clientX, touch.clientY);
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

    window.addEventListener('touchstart', (e) => {
      if (this.isEditingLayout) return;
      const touch = e.changedTouches[0];
      if (touch.clientX > window.innerWidth * 0.55 && touch.clientY > window.innerHeight * 0.3) {
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target && !target.closest('.touch-btn') && !target.closest('#game-hud')) {
          this.state.accelerating = 1;
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (this.isEditingLayout) return;
      const touch = e.changedTouches[0];
      if (touch.clientX > window.innerWidth * 0.55 && touch.clientY > window.innerHeight * 0.3) {
        if (!btnAccel.classList.contains('pressed')) {
          this.state.accelerating = 0;
        }
      }
    });
  }

  startLayoutCustomization() {
    this.isEditingLayout = true;
    this.controlsRoot.classList.add('customizing-layout');
    this.updateStickVisibility();

    const bar = document.createElement('div');
    bar.id = 'layout-edit-banner';
    bar.className = 'layout-edit-banner';
    bar.innerHTML = `
      <span>ボタンをドラッグして好きな位置に配置してください</span>
      <button id="btn-save-layout" class="primary-btn">配置を保存して終了</button>
    `;
    document.body.appendChild(bar);

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
      this.updateStickVisibility();
    };
  }
}
