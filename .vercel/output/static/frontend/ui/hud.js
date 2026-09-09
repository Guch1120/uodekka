// frontend/ui/hud.js
// レース中のHUD（順位、ラップ、速度メーター、アイテムスロット、ミニマップ、復帰カウントダウン、逆走警告）
import { Icons } from '../icons/icons.js';

export class HUD {
  constructor(container) {
    this.container = container;
    this.element = null;
    this.itemSlotEl = null;
    this.positionEl = null;
    this.lapEl = null;
    this.speedEl = null;
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.notificationEl = null;
    this.respawnBannerEl = null;
    this.respawnTimerNumEl = null;
    this.wrongWayEl = null;
    this.init();
  }

  init() {
    const hudDiv = document.createElement('div');
    hudDiv.id = 'game-hud';
    hudDiv.className = 'hud-container hidden';
    hudDiv.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-top-left-badges">
          <!-- 存在感のある大型の順位表示バッジ -->
          <div class="hud-badge position-badge">
            <span id="hud-pos-num">1</span><span class="pos-suffix">st</span>
          </div>
          <div class="hud-badge lap-badge">
            <span class="lap-label">LAP</span>
            <span class="lap-numbers"><span id="hud-lap-current">1</span>/<span id="hud-lap-total">3</span></span>
          </div>
        </div>
        <!-- 拡大された大型ミニマップ -->
        <div class="hud-minimap-wrapper">
          <canvas id="hud-minimap" width="260" height="260"></canvas>
        </div>
      </div>

      <div class="hud-top-center">
        <div id="hud-notification" class="hud-notification hidden"></div>
        <!-- ファイナルラップ大バナー -->
        <div id="hud-final-lap" class="final-lap-banner hidden">
          🏁 FINAL LAP! 🏁
        </div>
        <!-- 逆走警告バナー -->
        <div id="hud-wrong-way" class="wrong-way-banner hidden">
          ⚠️ 逆走中！ WRONG WAY ⚠️
        </div>
      </div>

      <div class="hud-top-right">
        <div id="hud-item-slot" class="item-slot-box empty">
          <div class="item-icon-wrapper" id="hud-item-icon"></div>
        </div>
        <button id="btn-open-pause" class="icon-btn" title="一時停止・中断 (Esc)">
          ${Icons.getSvg('pause')}
        </button>
        <button id="btn-open-settings" class="icon-btn" title="設定">
          ${Icons.getSvg('gear')}
        </button>
      </div>

      <!-- ダッシュキノコ／ブースト加速時の集中線Canvas -->
      <canvas id="hud-speedlines" class="speedlines-canvas hidden"></canvas>

      <!-- デウス・エクス・マキナ 復帰カウントダウン -->
      <div id="hud-respawn-banner" class="respawn-banner hidden">
        <div class="respawn-title">RESCUE & RESTORE</div>
        <div class="respawn-timer-circle" id="hud-respawn-timer">2</div>
      </div>

      <!-- 画面下部中央：スピードメーター（右下ボタンと重ならない快適配置） -->
      <div class="hud-bottom-center-info">
        <div class="speedometer">
          <span id="hud-speed-val">0</span> <span class="unit">km/h</span>
        </div>
        <div class="pc-key-guide">
          <span>[W/A/S/D] 運転</span>
          <span>[Space] ドリフト</span>
          <span>[E] アイテム</span>
          <span>[Esc] 一時停止</span>
        </div>
      </div>
    `;

    this.container.appendChild(hudDiv);
    this.element = hudDiv;

    this.itemSlotEl = hudDiv.querySelector('#hud-item-slot');
    this.itemIconEl = hudDiv.querySelector('#hud-item-icon');
    this.positionEl = hudDiv.querySelector('#hud-pos-num');
    this.lapEl = hudDiv.querySelector('#hud-lap-current');
    this.lapTotalEl = hudDiv.querySelector('#hud-lap-total');
    this.speedEl = hudDiv.querySelector('#hud-speed-val');
    this.notificationEl = hudDiv.querySelector('#hud-notification');
    this.finalLapEl = hudDiv.querySelector('#hud-final-lap');
    this.wrongWayEl = hudDiv.querySelector('#hud-wrong-way');

    this.respawnBannerEl = hudDiv.querySelector('#hud-respawn-banner');
    this.respawnTimerNumEl = hudDiv.querySelector('#hud-respawn-timer');

    this.minimapCanvas = hudDiv.querySelector('#hud-minimap');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.lastRecordedLap = 1;

    this.speedlinesCanvas = hudDiv.querySelector('#hud-speedlines');
    if (this.speedlinesCanvas) {
      this.speedlinesCtx = this.speedlinesCanvas.getContext('2d');
    }
  }

  renderSpeedlines(isBoosting) {
    if (!this.speedlinesCanvas || !this.speedlinesCtx) return;
    const canvas = this.speedlinesCanvas;
    const ctx = this.speedlinesCtx;

    if (!isBoosting) {
      canvas.classList.add('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    const numLines = 36;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2.5;

    for (let i = 0; i < numLines; i++) {
      const angle = (Math.PI * 2 / numLines) * i + (Math.random() * 0.15);
      const innerDist = Math.min(w, h) * (0.35 + Math.random() * 0.2);
      const outerDist = Math.max(w, h) * 0.8;

      const x1 = cx + Math.cos(angle) * innerDist;
      const y1 = cy + Math.sin(angle) * innerDist;
      const x2 = cx + Math.cos(angle) * outerDist;
      const y2 = cy + Math.sin(angle) * outerDist;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  showRespawnCountdown(remainingSeconds) {
    this.respawnBannerEl.classList.remove('hidden');
    this.respawnTimerNumEl.textContent = Math.ceil(remainingSeconds);
  }

  hideRespawnCountdown() {
    this.respawnBannerEl.classList.add('hidden');
  }

  update(playerState, trackPoints = []) {
    if (!playerState) return;

    this.positionEl.textContent = playerState.position || 1;
    const suffixEl = this.element.querySelector('.pos-suffix');
    const pos = playerState.position || 1;
    suffixEl.textContent = pos === 1 ? 'st' : (pos === 2 ? 'nd' : (pos === 3 ? 'rd' : 'th'));

    const posBadge = this.element.querySelector('.position-badge');
    if (posBadge) {
      posBadge.classList.remove('pos-1', 'pos-2', 'pos-3', 'pos-4');
      posBadge.classList.add(`pos-${Math.min(pos, 4)}`);
    }

    const curLap = playerState.currentLap || 1;
    const totLaps = playerState.totalLaps || 3;

    // ファイナルラップ突入演出
    if (curLap === totLaps && this.lastRecordedLap < totLaps) {
      this.showFinalLapBanner();
    }
    this.lastRecordedLap = curLap;

    this.lapEl.textContent = Math.min(curLap, totLaps);
    this.lapTotalEl.textContent = totLaps;
    this.speedEl.textContent = Math.round(Math.abs(playerState.speed || 0) * 3);

    // アイコンが変わったときだけ DOM を更新する。
    const itemIcon = playerState.holdingItem?.icon || null;
    if (itemIcon !== this.lastItemIcon) {
      this.lastItemIcon = itemIcon;
      this.itemSlotEl.classList.toggle('empty', !itemIcon);
      this.itemIconEl.innerHTML = itemIcon ? Icons.getSvg(itemIcon) : '';
    }

    if (playerState.isRespawning) {
      this.showRespawnCountdown(playerState.respawnTimer);
    } else {
      this.hideRespawnCountdown();
    }

    // 逆走警告表示
    if (playerState.isWrongWay && !playerState.isRespawning) {
      this.wrongWayEl.classList.remove('hidden');
    } else {
      this.wrongWayEl.classList.add('hidden');
    }

    this.drawMinimap(trackPoints, playerState.allKartPositions || []);
    this.renderSpeedlines(playerState.isBoosting || (playerState.boostTimer > 0));
  }

  showFinalLapBanner() {
    if (!this.finalLapEl) return;
    this.finalLapEl.classList.remove('hidden');
    setTimeout(() => {
      this.finalLapEl.classList.add('hidden');
    }, 3200);
  }

  resetLaps() {
    this.lastRecordedLap = 1;
  }

  showNotification(msg, durationMs = 2000) {
    this.notificationEl.textContent = msg;
    this.notificationEl.classList.remove('hidden');
    this.notificationEl.classList.add('fade-in');

    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => {
      this.notificationEl.classList.add('hidden');
      this.notificationEl.classList.remove('fade-in');
    }, durationMs);
  }

  drawMinimap(trackPoints, kartPositions) {
    if (!this.minimapCtx || trackPoints.length === 0) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // 背景円
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    trackPoints.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });

    const rangeX = (maxX - minX) || 1;
    const rangeZ = (maxZ - minZ) || 1;
    const maxRange = Math.max(rangeX, rangeZ) * 1.25;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const toMapX = (x) => (w / 2) + ((x - centerX) / maxRange) * (w - 44);
    const toMapY = (z) => (h / 2) + ((z - centerZ) / maxRange) * (h - 44);

    // コースアウトライン（黒縁）
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    trackPoints.forEach((p, idx) => {
      const mx = toMapX(p.x);
      const my = toMapY(p.z);
      if (idx === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.closePath();
    ctx.stroke();

    // コースライン本体（鮮明な白線）
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    trackPoints.forEach((p, idx) => {
      const mx = toMapX(p.x);
      const my = toMapY(p.z);
      if (idx === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.closePath();
    ctx.stroke();

    // カートアイコン描画（サイズ拡大で見やすく）
    kartPositions.forEach(k => {
      const mx = toMapX(k.x);
      const my = toMapY(k.z);

      if (k.isLocal) {
        // 自機：大きく目立つシアンブルー + 白リング
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        // ライバルカート：鮮やかなカラー + 白フチ
        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, Math.PI * 2);
        ctx.fillStyle = k.color || '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    });
  }

  show() {
    if (this.element) {
      this.element.classList.remove('hidden');
    }
  }

  hide() {
    if (this.element) {
      this.element.classList.add('hidden');
    }
  }
}
