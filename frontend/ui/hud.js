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
    hudDiv.className = 'hud-container';
    hudDiv.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-badge position-badge">
          <span id="hud-pos-num">1</span><span class="pos-suffix">st</span>
        </div>
        <div class="hud-badge lap-badge">
          LAP <span id="hud-lap-current">1</span>/<span id="hud-lap-total">3</span>
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
        <button id="btn-open-settings" class="icon-btn" title="設定">
          ${Icons.getSvg('gear')}
        </button>
      </div>

      <!-- デウス・エクス・マキナ 復帰カウントダウン -->
      <div id="hud-respawn-banner" class="respawn-banner hidden">
        <div class="respawn-title">RESCUE & RESTORE</div>
        <div class="respawn-timer-circle" id="hud-respawn-timer">2</div>
      </div>

      <div class="hud-bottom-right-info">
        <div class="speedometer">
          <span id="hud-speed-val">0</span> <span class="unit">km/h</span>
        </div>
        <canvas id="hud-minimap" width="120" height="120"></canvas>
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

    if (playerState.holdingItem) {
      this.itemSlotEl.classList.remove('empty');
      this.itemIconEl.innerHTML = Icons.getSvg(playerState.holdingItem.icon);
    } else {
      this.itemSlotEl.classList.add('empty');
      this.itemIconEl.innerHTML = '';
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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
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
    const maxRange = Math.max(rangeX, rangeZ) * 1.3;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const toMapX = (x) => (w / 2) + ((x - centerX) / maxRange) * (w - 24);
    const toMapY = (z) => (h / 2) + ((z - centerZ) / maxRange) * (h - 24);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 5;
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

    kartPositions.forEach(k => {
      const mx = toMapX(k.x);
      const my = toMapY(k.z);

      ctx.beginPath();
      ctx.arc(mx, my, k.isLocal ? 5.5 : 3.8, 0, Math.PI * 2);
      ctx.fillStyle = k.isLocal ? '#3498db' : (k.color || '#e74c3c');
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
}
