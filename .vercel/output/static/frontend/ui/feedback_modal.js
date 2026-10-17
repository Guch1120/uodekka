import { collectFeedbackContext } from './feedback_context.js';

// frontend/ui/feedback_modal.js
// ユーザーからのご意見・ご要望フォーム。
// 本番公開時は同一オリジンのサーバーレス関数 /api/feedback.cjs へPOSTし、GitHub Issueとして登録される。
// ローカルでは `/api/feedback` が存在しない（npx serve等の素の静的配信）ことが多いため、
// window.FEEDBACK_SERVER_URL でローカル開発用フィードバックサーバー（tools/feedback-server.cjs、
// needs.mdへMarkdown追記）を明示的に指定して動作確認できる。
// どちらのエンドポイントも起動していない/失敗した場合は送信できない旨をその場で表示する。

const CATEGORIES = ['不具合報告', '新機能の要望', '操作性・UI改善', 'その他'];
const MESSAGE_MAX_LENGTH = 1000;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_PAYLOAD_MAX_CHARS = 240_000;
const IMAGE_MAX_COUNT = 5;
const IMAGE_HINT = '画像は5枚まで、1枚2MBまで添付できます。';

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.82, 0.7, 0.55, 0.4, 0.25]) {
          const data = canvas.toDataURL('image/jpeg', quality);
          if (data.length <= IMAGE_PAYLOAD_MAX_CHARS) return resolve(data);
        }
        reject(new Error('image too large'));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

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
    this.images = [];
    this.context = null;
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

          <div class="setting-row">
            <div class="setting-label"><strong>画像（任意）</strong></div>
            <input type="file" id="feedback-image" class="feedback-file" multiple accept="image/png,image/jpeg,image/gif,image/webp">
            <div id="feedback-image-name" class="feedback-file-name">${IMAGE_HINT}</div>
            <div id="feedback-images" class="feedback-images" aria-label="選択した画像"></div>
          </div>

          <div class="setting-row feedback-steps-row">
            <div class="setting-label"><strong>再現手順（任意）</strong></div>
            <textarea id="feedback-steps" class="feedback-textarea feedback-steps-input" maxlength="500" rows="2" placeholder="直前に開いた画面や、押したボタンなど"></textarea>
          </div>
          <p id="feedback-native-orientation" class="feedback-native-orientation" hidden>OSの入力画面も横向きで使う場合は、端末の回転ロックを解除して横持ちしてください。ゲーム画面のCSS回転ではOSの向きは変わりません。</p>
          <details class="feedback-privacy">
            <summary>公開される情報について</summary>
            <p>本文・任意のお名前・再現手順・画像・下記の動作情報は公開GitHub Issueに掲載されます。画像に個人情報が写っていないかご確認ください。URL、ルームID、通信ログ、保存データ、画像のファイル名は自動送信しません。</p>
            <p>動作情報はフォームを開いた時点のものです。OS・ブラウザの版は申告された主バージョンで、実際と異なる場合があります。</p>
            <pre id="feedback-context"></pre>
          </details>
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
    const imageEl = this.modalEl.querySelector('#feedback-image');

    btnClose.onclick = () => this.hide();

    messageEl.addEventListener('input', () => {
      charCountEl.textContent = String(messageEl.value.length);
    });
    imageEl.addEventListener('change', () => {
      const files = Array.from(imageEl.files || []);
      imageEl.value = '';
      if (this.sending || files.length === 0) return;
      if (files.some(file => !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) || file.size > IMAGE_MAX_BYTES)) {
        this.setStatus('画像はPNG/JPEG/GIF/WebP形式で1枚2MBまで添付できます。', 'error'); return;
      }
      const additions = files.filter(file => !this.images.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified));
      if (this.images.length + additions.length > IMAGE_MAX_COUNT) {
        this.setStatus('画像は合計5枚までです。不要な画像を×で削除してから追加してください。', 'error'); return;
      }
      for (const file of additions) this.images.push({ file, url: URL.createObjectURL(file) });
      this.renderImages(); this.setStatus('', 'hidden');
      window.recoverAppPresentation?.();
    });

    btnSend.onclick = () => this.submit();
  }

  renderImages() {
    const list = this.modalEl.querySelector('#feedback-images'); list.replaceChildren();
    this.images.forEach((item, index) => {
      const figure = document.createElement('figure'); figure.className = 'feedback-image-preview';
      const img = document.createElement('img'); img.src = item.url; img.alt = `選択画像 ${index + 1}`;
      const caption = document.createElement('figcaption'); caption.textContent = item.file.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'feedback-image-remove'; remove.textContent = '×';
      remove.setAttribute('aria-label', `画像${index + 1}（${item.file.name}）を削除`); remove.disabled = this.sending;
      remove.onclick = () => {
        if (this.sending) return;
        URL.revokeObjectURL(item.url); this.images = this.images.filter(image => image !== item); this.renderImages();
      };
      figure.append(img, caption, remove); list.append(figure);
    });
    this.modalEl.querySelector('#feedback-image-name').textContent = this.images.length ? `${this.images.length} / ${IMAGE_MAX_COUNT}枚選択中（×で削除）` : IMAGE_HINT;
  }

  clearImages() {
    for (const image of this.images) URL.revokeObjectURL(image.url);
    this.images = []; this.renderImages();
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
    const imageEl = this.modalEl.querySelector('#feedback-image');

    const message = messageEl.value.trim();
    if (!message) {
      this.setStatus('内容を入力してください。', 'error');
      messageEl.focus();
      return;
    }
    const selected = [...this.images];
    const category = categoryEl.value, name = nameEl.value.trim();
    const steps = this.modalEl.querySelector('#feedback-steps').value.trim().slice(0, 500);
    const diagnostics = this.context || collectFeedbackContext();

    this.sending = true;
    btnSend.disabled = true;
    imageEl.disabled = true; this.renderImages();
    btnSend.textContent = '送信中...';
    this.setStatus('', 'hidden');

    try {
      const images = [];
      // モバイルのメモリ使用を抑えるため、画像を1枚ずつJPEGへ変換する（EXIFも持ち越さない）。
      for (const image of selected) images.push(await prepareImage(image.file));
      const response = await fetch(defaultFeedbackServerUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          name,
          message: message.slice(0, MESSAGE_MAX_LENGTH),
          images,
          steps,
          diagnostics
        })
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const result = await response.json();
      if (images.length && (result.imagesReceived !== images.length || result.imagesAttached !== images.length)) {
        throw new Error('image-count-mismatch');
      }
      this.setStatus(result.storage === 'local' ? 'ローカルの開発用ファイルへ保存しました。' : images.length ? `送信しました。画像${images.length}枚もGitHubに添付されています。` : '送信しました。ありがとうございます！', 'success');
      messageEl.value = '';
      this.modalEl.querySelector('#feedback-steps').value = '';
      this.modalEl.querySelector('#feedback-char-count').textContent = '0';
      imageEl.value = '';
      this.clearImages();
    } catch (err) {
      this.setStatus(err.message === 'image-count-mismatch'
        ? '送信先で画像枚数の確認ができませんでした。管理者へお問い合わせください。'
        : err.message === 'image too large'
        ? '画像を送信用サイズに変換できませんでした。画像のサイズを小さくして選び直してください。'
        : '送信に失敗しました。内容と画像は保持しています。時間をおいて再度お試しください。', 'error');
    } finally {
      this.sending = false;
      btnSend.disabled = false;
      imageEl.disabled = false; this.renderImages();
      btnSend.textContent = '送信する';
    }
  }

  show(defaultName = '') {
    this.context = collectFeedbackContext();
    this.modalEl.querySelector('#feedback-context').textContent = JSON.stringify(this.context, null, 2);
    this.modalEl.querySelector('#feedback-native-orientation').hidden = !(this.context.cssLandscape && this.context.os === 'iOS' && !this.context.orientationLockAvailable);
    document.body.classList.add('feedback-open');
    const nameEl = this.modalEl.querySelector('#feedback-name');
    if (nameEl && !nameEl.value) {
      nameEl.value = defaultName || (this.getDefaultName ? this.getDefaultName() : '');
    }
    this.setStatus('', 'hidden');
    this.modalEl.classList.remove('hidden');
  }

  hide() {
    this.modalEl.classList.add('hidden');
    document.body.classList.remove('feedback-open');
  }
}
