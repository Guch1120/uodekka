// frontend/ui/feedback_modal.js
// ユーザーからのご意見・ご要望フォーム。
// 本番公開時は同一オリジンのサーバーレス関数 /api/feedback.cjs へPOSTし、GitHub Issueとして登録される。
// ローカルでは `/api/feedback` が存在しない（npx serve等の素の静的配信）ことが多いため、
// window.FEEDBACK_SERVER_URL でローカル開発用フィードバックサーバー（tools/feedback-server.cjs、
// needs.mdへMarkdown追記）を明示的に指定して動作確認できる。
// どちらのエンドポイントも起動していない/失敗した場合は送信できない旨をその場で表示する。

const CATEGORIES = ['不具合報告', '新機能の要望', '操作性・UI改善', 'その他'];
const MESSAGE_MAX_LENGTH = 1000;

function defaultFeedbackServerUrl() {
  if (typeof window !== 'undefined' && window.FEEDBACK_SERVER_URL) return window.FEEDBACK_SERVER_URL;
  return '/api/feedback';
}

export class FeedbackModal {
  constructor(container, getDefaultName = () => '') {
    this.container = container;
    this.getDefaultName = getDefaultName;
    this.modalEl = null;
    this.sending = false;
    this.init();
  }

  init() {
    const modal = document.createElement('div');
    modal.id = 'feedback-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h2>ご意見・ご要望</h2>
          <button class="btn-close" id="btn-close-feedback">×</button>
        </div>
        <div class="modal-body">
          <p class="feedback-intro">不具合報告や「こんな機能が欲しい」というご要望をお寄せください。開発の参考にさせていただきます。</p>

          <div class="setting-row">
            <div class="setting-label"><strong>カテゴリ</strong></div>
            <select id="feedback-category" class="feedback-select">
              ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>

          <div class="setting-row">
            <div class="setting-label"><strong>お名前（任意）</strong></div>
            <input type="text" id="feedback-name" class="feedback-input" maxlength="20" placeholder="未入力の場合は「匿名」">
          </div>

          <div class="setting-row">
            <div class="setting-label"><strong>内容</strong></div>
            <textarea id="feedback-message" class="feedback-textarea" maxlength="${MESSAGE_MAX_LENGTH}" rows="6" placeholder="不具合の内容や、あったら嬉しい機能を書いてください"></textarea>
            <div class="feedback-char-count"><span id="feedback-char-count">0</span> / ${MESSAGE_MAX_LENGTH}</div>
          </div>

          <div id="feedback-status" class="feedback-status hidden"></div>
        </div>
        <div class="modal-footer">
          <button id="btn-send-feedback" class="primary-btn">送信する</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);
    this.modalEl = modal;
    this.bindEvents();
  }

  bindEvents() {
    const btnClose = this.modalEl.querySelector('#btn-close-feedback');
    const btnSend = this.modalEl.querySelector('#btn-send-feedback');
    const messageEl = this.modalEl.querySelector('#feedback-message');
    const charCountEl = this.modalEl.querySelector('#feedback-char-count');

    btnClose.onclick = () => this.hide();

    messageEl.addEventListener('input', () => {
      charCountEl.textContent = String(messageEl.value.length);
    });

    btnSend.onclick = () => this.submit();
  }

  setStatus(message, kind) {
    const statusEl = this.modalEl.querySelector('#feedback-status');
    statusEl.textContent = message;
    statusEl.className = `feedback-status ${kind}`;
  }

  async submit() {
    if (this.sending) return;

    const categoryEl = this.modalEl.querySelector('#feedback-category');
    const nameEl = this.modalEl.querySelector('#feedback-name');
    const messageEl = this.modalEl.querySelector('#feedback-message');
    const btnSend = this.modalEl.querySelector('#btn-send-feedback');

    const message = messageEl.value.trim();
    if (!message) {
      this.setStatus('内容を入力してください。', 'error');
      messageEl.focus();
      return;
    }

    this.sending = true;
    btnSend.disabled = true;
    btnSend.textContent = '送信中...';
    this.setStatus('', 'hidden');

    try {
      const response = await fetch(defaultFeedbackServerUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryEl.value,
          name: nameEl.value.trim(),
          message: message.slice(0, MESSAGE_MAX_LENGTH)
        })
      });
      if (!response.ok) throw new Error(`status ${response.status}`);

      this.setStatus('送信しました。ありがとうございます！', 'success');
      messageEl.value = '';
      this.modalEl.querySelector('#feedback-char-count').textContent = '0';
    } catch (err) {
      this.setStatus('送信に失敗しました。ローカルのフィードバックサーバーが起動しているかご確認ください。', 'error');
    } finally {
      this.sending = false;
      btnSend.disabled = false;
      btnSend.textContent = '送信する';
    }
  }

  show(defaultName = '') {
    const nameEl = this.modalEl.querySelector('#feedback-name');
    if (nameEl && !nameEl.value) {
      nameEl.value = defaultName || (this.getDefaultName ? this.getDefaultName() : '');
    }
    this.setStatus('', 'hidden');
    this.modalEl.classList.remove('hidden');
  }

  hide() {
    this.modalEl.classList.add('hidden');
  }
}
