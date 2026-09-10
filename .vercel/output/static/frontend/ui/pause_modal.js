// frontend/ui/pause_modal.js
// レース一時停止モーダル（再開、やり直す（ソロのみ）、レースをやめる）
import { Icons } from '../icons/icons.js';

export class PauseModal {
  constructor(container, onResume, onRestart, onQuit, getDiagnostics = null) {
    this.container = container;
    this.onResume = onResume;
    this.onRestart = onRestart;
    this.onQuit = onQuit;
    this.getDiagnostics = getDiagnostics;
    this.modalEl = null;
    this.mode = 'solo';
    this.init();
  }

  init() {
    const modal = document.createElement('div');
    modal.id = 'pause-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="modal-dialog pause-dialog">
        <div class="modal-header">
          <h2>PAUSE (一時停止)</h2>
          <button id="btn-pause-close" class="btn-close" type="button" aria-label="閉じる (レースに戻る)">×</button>
        </div>
        <div class="modal-body pause-body">
          <p class="pause-desc">レースを一時中断しています。</p>
          <div class="pause-actions" id="pause-main-actions">
            <button id="btn-pause-resume" class="primary-btn pause-action-btn" type="button">
              ▶ レースを続ける
            </button>
            <button id="btn-pause-restart" class="action-btn pause-action-btn restart-btn" type="button">
              🔄 最初からやり直す
            </button>
            <button id="btn-pause-diagnostics" class="btn-secondary pause-action-btn" type="button" style="background: #1e293b; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">
              📋 描画・通信診断をコピー
            </button>
            <button id="btn-pause-quit" class="btn-secondary pause-action-btn quit-btn" type="button">
              🚪 レースをやめる (ロビーへ)
            </button>
            <pre id="pause-diagnostic-output" class="hidden" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:160px;overflow-y:auto;font-size:11px;line-height:1.4;background:#0f172a;color:#94a3b8;padding:10px;border-radius:8px;margin-top:10px;border:1px solid #334155;text-align:left;"></pre>
          </div>

          <!-- 確認パネル（ブラウザのネイティブダイアログを使わずモーダル内で完結） -->
          <div class="pause-actions hidden" id="pause-confirm-quit-actions">
            <p style="color: #f87171; font-weight: bold; font-size: 15px;">本当にレースをやめてロビーに戻りますか？</p>
            <button id="btn-confirm-quit-yes" class="btn-secondary pause-action-btn quit-btn" type="button" style="background: #dc2626; color: #fff;">
              はい、レースをやめる
            </button>
            <button id="btn-confirm-quit-no" class="action-btn pause-action-btn restart-btn" type="button">
              キャンセル (ポーズに戻る)
            </button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(modal);
    this.modalEl = modal;

    this.bindEvents();
  }

  bindEvents() {
    const btnResume = this.modalEl.querySelector('#btn-pause-resume');
    const btnClose = this.modalEl.querySelector('#btn-pause-close');
    const btnRestart = this.modalEl.querySelector('#btn-pause-restart');
    const btnQuit = this.modalEl.querySelector('#btn-pause-quit');
    const mainActions = this.modalEl.querySelector('#pause-main-actions');
    const confirmActions = this.modalEl.querySelector('#pause-confirm-quit-actions');
    const btnConfirmYes = this.modalEl.querySelector('#btn-confirm-quit-yes');
    const btnConfirmNo = this.modalEl.querySelector('#btn-confirm-quit-no');

    // タッチ＆クリックの二重発火防止とスマホでの即時反応を両立するタップハンドラー
    const bindTap = (el, fn) => {
      if (!el) return;
      let lastTrigger = 0;
      const trigger = (e) => {
        if (e) {
          e.stopPropagation();
        }
        const now = performance.now();
        if (now - lastTrigger < 300) return;
        lastTrigger = now;
        fn();
      };
      el.addEventListener('pointerup', trigger);
      el.addEventListener('click', trigger);
    };

    const handleResume = () => {
      this.hide();
      if (this.onResume) this.onResume();
    };

    bindTap(btnResume, handleResume);
    bindTap(btnClose, handleResume);

    // 背景（ダイアログ外）タップ・クリックでもレースに即復帰
    const handleBackdrop = (e) => {
      if (e.target === this.modalEl) {
        e.preventDefault();
        handleResume();
      }
    };
    this.modalEl.addEventListener('pointerdown', handleBackdrop);
    this.modalEl.addEventListener('click', handleBackdrop);

    bindTap(btnRestart, () => {
      if (this.mode !== 'solo') return;
      this.hide();
      if (this.onRestart) this.onRestart();
    });

    bindTap(btnQuit, () => {
      mainActions.classList.add('hidden');
      confirmActions.classList.remove('hidden');
    });

    bindTap(btnConfirmNo, () => {
      confirmActions.classList.add('hidden');
      mainActions.classList.remove('hidden');
    });

    bindTap(btnConfirmYes, () => {
      confirmActions.classList.add('hidden');
      mainActions.classList.remove('hidden');
      this.hide();
      if (this.onQuit) this.onQuit();
    });

    const btnDiag = this.modalEl.querySelector('#btn-pause-diagnostics');
    const diagOutput = this.modalEl.querySelector('#pause-diagnostic-output');

    if (btnDiag) {
      bindTap(btnDiag, async () => {
        const text = this.getDiagnostics ? this.getDiagnostics() : '診断情報は取得できませんでした。';
        diagOutput.classList.remove('hidden');
        diagOutput.textContent = text;
        try {
          await navigator.clipboard.writeText(text);
          btnDiag.textContent = '✓ 診断をコピーしました！';
          setTimeout(() => {
            if (btnDiag) btnDiag.textContent = '📋 描画・通信診断をコピー';
          }, 3000);
        } catch (_) {
          btnDiag.textContent = '⚠️ 下のテキストを長押しコピーしてください';
        }
      });
    }
  }

  show(mode = 'solo') {
    this.mode = mode;
    const btnRestart = this.modalEl.querySelector('#btn-pause-restart');
    if (btnRestart) {
      btnRestart.style.display = (mode === 'solo') ? 'block' : 'none';
    }
    // メインパネルを表示、確認パネルを非表示にリセット
    const mainActions = this.modalEl.querySelector('#pause-main-actions');
    const confirmActions = this.modalEl.querySelector('#pause-confirm-quit-actions');
    if (mainActions) mainActions.classList.remove('hidden');
    if (confirmActions) confirmActions.classList.add('hidden');

    const diagOutput = this.modalEl.querySelector('#pause-diagnostic-output');
    if (diagOutput) diagOutput.classList.add('hidden');
    const btnDiag = this.modalEl.querySelector('#btn-pause-diagnostics');
    if (btnDiag) btnDiag.textContent = '📋 描画・通信診断をコピー';

    this.modalEl.classList.remove('hidden');
  }

  hide() {
    this.modalEl.classList.add('hidden');
  }
}
