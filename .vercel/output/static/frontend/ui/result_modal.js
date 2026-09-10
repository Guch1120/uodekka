// frontend/ui/result_modal.js
// レース終了リザルト画面（順位、ラップタイム、トータルタイム、3つのアクション選択）

export class ResultModal {
  static formatTime(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '--:--.---';
    const totalSeconds = ms / 1000;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const millis = Math.floor(ms % 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  static getOrdinalSuffix(rank) {
    if (rank === 1) return 'st';
    if (rank === 2) return 'nd';
    if (rank === 3) return 'rd';
    return 'th';
  }

  constructor(container, data, callbacks = {}) {
    this.container = container;
    this.data = data || {};
    this.callbacks = callbacks;
    this.modalEl = null;
    this.init();
  }

  init() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'race-result-modal';
    this.modalEl.className = 'modal-backdrop result-modal-backdrop';

    const rank = this.data.rank || 1;
    const suffix = ResultModal.getOrdinalSuffix(rank);
    const totalTimeStr = ResultModal.formatTime(this.data.totalTime);
    const lapTimes = this.data.lapTimes || [];

    // 最速ラップ（ベストラップ）のインデックス特定
    let bestLapIndex = -1;
    let minLapTime = Infinity;
    lapTimes.forEach((t, idx) => {
      if (t > 0 && t < minLapTime) {
        minLapTime = t;
        bestLapIndex = idx;
      }
    });

    const lapsHtml = lapTimes.map((t, idx) => {
      const isBest = idx === bestLapIndex && lapTimes.length > 1;
      return `
        <div class="result-lap-row ${isBest ? 'best-lap' : ''}">
          <span class="lap-label">LAP ${idx + 1}</span>
          <span class="lap-time">${ResultModal.formatTime(t)}</span>
          ${isBest ? '<span class="best-badge">BEST</span>' : ''}
        </div>
      `;
    }).join('');

    // 全員（12名）の順位リスト
    const racers = this.data.racers || [];
    const racersHtml = racers.slice(0, 12).map((r, i) => {
      const isLocal = r.isLocal;
      return `
        <li class="result-standing-item ${isLocal ? 'current-player' : ''}">
          <span class="standing-rank">${i + 1}</span>
          <span class="standing-dot" style="background-color: ${r.colorHex || '#e74c3c'}"></span>
          <span class="standing-name">${r.name || 'CPU'}</span>
          <span class="standing-time">${r.totalTime ? ResultModal.formatTime(r.totalTime) : (isLocal ? totalTimeStr : 'FINISH')}</span>
        </li>
      `;
    }).join('');

    const rankBadgeClass = rank === 1 ? 'rank-gold' : (rank === 2 ? 'rank-silver' : (rank === 3 ? 'rank-bronze' : 'rank-other'));

    this.modalEl.innerHTML = `
      <div class="modal-card result-modal-card" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <div class="result-header">
          <span class="result-kicker">🏁 RACE FINISH</span>
          <h2 id="result-title" class="result-course-title">${this.data.courseName || 'レース結果'}</h2>
        </div>

        <div class="result-main-grid">
          <div class="result-player-summary">
            <!-- 巨大順位バッジ -->
            <div class="result-rank-badge ${rankBadgeClass}">
              <span class="result-rank-num">${rank}</span><span class="result-rank-suffix">${suffix}</span>
            </div>
            <div class="result-rank-text">${rank === 1 ? 'WINNER! 優勝おめでとう！' : (rank <= 3 ? 'PODIUM! 表彰台獲得！' : 'GOAL! 完走！')}</div>

            <!-- タイムテーブル -->
            <div class="result-times-card">
              <div class="result-total-time">
                <span class="time-label">TOTAL TIME</span>
                <span class="time-value">${totalTimeStr}</span>
              </div>
              <div class="result-laps-list">
                ${lapsHtml}
              </div>
            </div>

            <!-- コイン獲得サマリー -->
            <div class="result-coin-summary">
              <span class="coin-gain-text">🪙 今回獲得コイン: <strong>+${this.data.coinsEarned || 0}</strong> 枚</span>
              <span class="coin-bank-text">（累計所持: 🪙 <strong>${this.data.bankCoins || 0}</strong> 枚）</span>
            </div>
          </div>

          <div class="result-standings-panel">
            <h3 class="standings-heading">最終順位（12人）</h3>
            <ul class="result-standings-list">
              ${racersHtml}
            </ul>
          </div>
        </div>

        <!-- 3つのアクションボタン -->
        <div class="result-actions">
          <button id="btn-result-retry" class="result-btn btn-retry">
            <span class="btn-icon">🔄</span>
            <span class="btn-text">同じレースでもう一度</span>
          </button>
          <button id="btn-result-change-course" class="result-btn btn-change-course">
            <span class="btn-icon">🏁</span>
            <span class="btn-text">他レース選択</span>
          </button>
          <button id="btn-result-home" class="result-btn btn-home">
            <span class="btn-icon">🏠</span>
            <span class="btn-text">ホームに戻る</span>
          </button>
        </div>
      </div>
    `;

    this.container.appendChild(this.modalEl);

    // イベントバインド
    this.modalEl.querySelector('#btn-result-retry').addEventListener('click', () => {
      this.destroy();
      if (this.callbacks.onRetry) this.callbacks.onRetry();
    });

    this.modalEl.querySelector('#btn-result-change-course').addEventListener('click', () => {
      this.destroy();
      if (this.callbacks.onChangeCourse) this.callbacks.onChangeCourse();
    });

    this.modalEl.querySelector('#btn-result-home').addEventListener('click', () => {
      this.destroy();
      if (this.callbacks.onHome) this.callbacks.onHome();
    });
  }

  show() {
    if (this.modalEl) this.modalEl.classList.remove('hidden');
  }

  hide() {
    if (this.modalEl) this.modalEl.classList.add('hidden');
  }

  destroy() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}
