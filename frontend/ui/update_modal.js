// frontend/ui/update_modal.js
// アップデート通知モーダル
import { UPDATE_NOTIFICATION } from '../data/updates.js';

export class UpdateModal {
  static STORAGE_KEY = 'kart_last_read_update_version';

  static isUnread() {
    if (!UPDATE_NOTIFICATION.enabled) return false;
    const lastRead = localStorage.getItem(this.STORAGE_KEY);
    return lastRead !== UPDATE_NOTIFICATION.version;
  }

  static markAsRead() {
    localStorage.setItem(this.STORAGE_KEY, UPDATE_NOTIFICATION.version);
  }

  static checkAndShow(container, onDismiss) {
    if (this.isUnread()) {
      const modal = new UpdateModal(container, () => {
        this.markAsRead();
        if (onDismiss) onDismiss();
      });
      modal.show();
      return true;
    }
    return false;
  }

  constructor(container, onDismiss = null) {
    this.container = container;
    this.onDismiss = onDismiss;
    this.modalEl = null;
    this.init();
  }

  init() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'update-modal';
    this.modalEl.className = 'modal-backdrop update-modal-backdrop hidden';

    const itemsHtml = UPDATE_NOTIFICATION.items.map(item => `
      <div class="update-item">
        <div class="update-item-header">
          <span class="update-badge ${item.badge === 'NEW' ? 'badge-new' : 'badge-update'}">${item.badge}</span>
          <span class="update-item-title">${item.title}</span>
        </div>
        <p class="update-item-desc">${item.desc}</p>
      </div>
    `).join('');

    this.modalEl.innerHTML = `
      <div class="modal-card update-modal-card" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
        <div class="update-modal-header">
          <div class="update-version-tag">Ver ${UPDATE_NOTIFICATION.version} (${UPDATE_NOTIFICATION.date})</div>
          <h2 id="update-modal-title" class="update-modal-title">${UPDATE_NOTIFICATION.title}</h2>
          <p class="update-modal-subtitle">いつもUO:De Carをお楽しみいただきありがとうございます！新機能をお知らせします。</p>
        </div>
        <div class="update-modal-body">
          ${itemsHtml}
        </div>
        <div class="update-modal-footer">
          <button id="btn-update-confirm" class="primary-btn update-confirm-btn">確認して進む ➔</button>
        </div>
      </div>
    `;

    this.container.appendChild(this.modalEl);

    const btnConfirm = this.modalEl.querySelector('#btn-update-confirm');
    btnConfirm.addEventListener('click', () => {
      this.hide();
      UpdateModal.markAsRead();
      if (this.onDismiss) this.onDismiss();
    });
  }

  show() {
    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
    }
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
  }

  destroy() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}
