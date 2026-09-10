// frontend/ui/update_modal.js
// アップデート通知モーダル（最新リリースは展開表示、過去リリースはトグルで折りたたみ）
import { UPDATE_NOTIFICATION } from '../data/updates.js';

function renderUpdateItem(item) {
  return `
    <div class="update-item">
      <div class="update-item-header">
        <span class="update-badge ${item.badge === 'NEW' ? 'badge-new' : 'badge-update'}">${item.badge}</span>
        <span class="update-item-title">${item.title}</span>
      </div>
      <p class="update-item-desc">${item.desc}</p>
    </div>
  `;
}

function renderReleaseBlock(release) {
  return `
    <div class="update-release-block">
      <div class="update-release-header">Ver ${release.version} (${release.date})</div>
      ${release.items.map(renderUpdateItem).join('')}
    </div>
  `;
}

export class UpdateModal {
  static STORAGE_KEY = 'kart_last_read_update_version';

  static get latestRelease() {
    return UPDATE_NOTIFICATION.releases?.[0] || null;
  }

  static isUnread() {
    if (!UPDATE_NOTIFICATION.enabled) return false;
    const latest = this.latestRelease;
    if (!latest) return false;
    const lastRead = localStorage.getItem(this.STORAGE_KEY);
    return lastRead !== latest.version;
  }

  static markAsRead() {
    const latest = this.latestRelease;
    if (latest) localStorage.setItem(this.STORAGE_KEY, latest.version);
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
    const latest = UpdateModal.latestRelease;
    const pastReleases = (UPDATE_NOTIFICATION.releases || []).slice(1);

    this.modalEl = document.createElement('div');
    this.modalEl.id = 'update-modal';
    this.modalEl.className = 'modal-backdrop update-modal-backdrop hidden';

    const itemsHtml = latest ? latest.items.map(renderUpdateItem).join('') : '';

    const pastToggleHtml = pastReleases.length > 0 ? `
      <button id="btn-toggle-past-updates" class="past-updates-toggle" type="button" aria-expanded="false">
        <span class="past-updates-toggle-label">過去の更新履歴を見る（${pastReleases.length}件）</span>
        <span class="past-updates-toggle-arrow">▼</span>
      </button>
      <div id="past-updates-body" class="past-updates-body hidden">
        ${pastReleases.map(renderReleaseBlock).join('')}
      </div>
    ` : '';

    this.modalEl.innerHTML = `
      <div class="modal-card update-modal-card" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
        <div class="update-modal-header">
          <div class="update-version-tag">Ver ${latest ? latest.version : ''} (${latest ? latest.date : ''})</div>
          <h2 id="update-modal-title" class="update-modal-title">${latest ? latest.title : ''}</h2>
          <p class="update-modal-subtitle">いつもUO:De Carをお楽しみいただきありがとうございます！新機能をお知らせします。</p>
        </div>
        <div class="update-modal-body">
          ${itemsHtml}
          ${pastToggleHtml}
        </div>
        <div class="update-modal-footer">
          <button id="btn-update-confirm" class="primary-btn update-confirm-btn">確認して進む ➔</button>
        </div>
      </div>
    `;

    this.container.appendChild(this.modalEl);

    const btnToggle = this.modalEl.querySelector('#btn-toggle-past-updates');
    if (btnToggle) {
      const pastBody = this.modalEl.querySelector('#past-updates-body');
      btnToggle.addEventListener('click', () => {
        const expanded = btnToggle.getAttribute('aria-expanded') === 'true';
        btnToggle.setAttribute('aria-expanded', String(!expanded));
        btnToggle.classList.toggle('expanded', !expanded);
        pastBody.classList.toggle('hidden', expanded);
      });
    }

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
