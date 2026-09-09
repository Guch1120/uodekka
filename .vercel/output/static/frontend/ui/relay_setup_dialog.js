import { probeRelay } from '../../backend/network/relay_probe.js';
import { loadIceConfig } from '../../backend/network/ice_config.js';

export class RelaySetupDialog {
  constructor(container) {
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'relay-setup-dialog';
    this.dialog.className = 'garage-dialog garage-relay-dialog';
    this.dialog.setAttribute('aria-labelledby', 'relay-setup-title');
    this.dialog.innerHTML = `
      <div class="garage-dialog-heading"><span class="garage-eyebrow">MULTIPLAYER / CONNECTION HELP</span><button type="button" class="garage-close" data-close aria-label="設定案内を閉じる">×</button></div>
      <h2 id="relay-setup-title" tabindex="-1">中継サーバーの設定</h2>
      <p id="relay-setup-status" role="status" aria-live="polite"></p>
      <p>回線によっては、端末同士をつなぐ中継サーバー（TURN）が必要です。<strong>このゲームを公開したサイト管理者が一度設定します。</strong>ゲスト一人ひとりが作る必要はありません。</p>
      <p>管理者ではない方は、この画面の設定をサイト管理者に依頼してください。ルームIDの入力欄には、サーバー情報を入力しません。</p>
      <details open><summary>サイト管理者向け：中継サービスを作成する</summary>
        <ol>
          <li><a href="https://dashboard.metered.ca/" target="_blank" rel="noopener noreferrer">Meteredを開く ↗</a>からアカウントとアプリを作成し、TURN credentialを発行します。利用プランと料金を確認してください。<a href="https://www.metered.ca/docs/turn-server-service/creating-turn-credentials/" target="_blank" rel="noopener noreferrer">公式の作成手順 ↗</a></li>
          <li><a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Vercelを開く ↗</a> → このゲームのプロジェクト → Settings → Environment Variablesで、Productionに次の2つを保存します。
            <dl><dt><code>METERED_DOMAIN</code></dt><dd>アプリのドメイン（例：アプリ名.metered.live）。https:// やパスは付けません。</dd><dt><code>METERED_TURN_API_KEY</code></dt><dd>作成したTURN credentialの「Show API Key」で取得したキー。管理用Secret Keyとは別です。</dd></dl>
            キーはVercelの設定欄に保存し、ゲーム画面や公開コードには貼り付けないでください。
          </li>
          <li>VercelのDeploymentsから再デプロイして設定を反映します。<a href="https://vercel.com/docs/environment-variables" target="_blank" rel="noopener noreferrer">環境変数の公式手順 ↗</a></li>
          <li>下の「設定を再確認」を押します。設定が確認できたら、ホストはルームを作り直し、ゲストは参加をやり直してください。</li>
        </ol>
      </details>
      <p class="garage-note">この案内を閉じても接続処理は続きます。再確認は設定の取得を調べるもので、実際の中継接続の成功を保証するものではありません。</p>
      <p id="relay-probe-status" role="status" aria-live="polite"></p><button type="button" id="relay-probe" class="garage-button garage-button-light">この端末の中継接続を検査</button><div class="garage-relay-actions"><button type="button" id="relay-recheck" class="garage-button garage-button-green">設定を再確認</button><button type="button" class="garage-button garage-button-light" data-close>閉じる</button></div>`;
    container.appendChild(this.dialog);
    this.dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => this.close());
    this.dialog.querySelector('#relay-probe').onclick = () => this.recheck(true);
    this.dialog.querySelector('#relay-recheck').onclick = () => this.recheck();
    this.dialog.addEventListener('close', () => { this.request?.abort(); });
  }

  show(config = null) {
    this.request?.abort();
    this.dialog.querySelector('#relay-probe-status').textContent = '';
    this.setStatus(config);
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelector('#relay-setup-title').focus();
  }

  setStatus(config) {
    this.dialog.querySelector('#relay-setup-status').textContent = !config
      ? '中継サービスの作成からゲームへの設定までの手順を案内します。'
      : config.relayConfigured
        ? '中継設定を取得できました。接続中の場合は一度閉じて、ルーム作成・参加をやり直してください。'
        : config.reason === 'not-configured'
          ? '中継サーバーが未設定です。直接接続だけでは参加できない回線があります。'
          : '中継設定を取得できませんでした。未作成とは限りません。管理者は通信状態、環境変数、サービスの稼働状況と /api/ice-servers の配信を確認してください。';
  }

  async recheck(testConnection = false) {
    this.request?.abort();
    const request = this.request = new AbortController();
    const button = this.dialog.querySelector('#relay-recheck');
    const probeButton = this.dialog.querySelector('#relay-probe');
    button.disabled = probeButton.disabled = true;
    const output = this.dialog.querySelector('#relay-probe-status');
    output.textContent = '';
    this.dialog.querySelector('#relay-setup-status').textContent = '中継設定を確認しています…';
    try {
      const config = await loadIceConfig({ signal: request.signal });
      if (!request.signal.aborted && this.dialog.open) {
        this.setStatus(config);
        if (testConnection && config.relayConfigured) {
          output.textContent = 'この端末から中継サーバーへの到達を確認中です（最大12秒）…';
          const result = await probeRelay(config.iceServers, { signal: request.signal });
          if (!request.signal.aborted && this.dialog.open) output.textContent = {
            reachable: '中継候補を取得できました。この端末から中継サーバーへ到達しています。次にホスト・ゲストでルーム参加を確認してください。',
            unreachable: '中継候補を取得できませんでした。管理者は認証の有効期限と利用上限を確認してください。UDPが制限された回線では、サービスが提供するTURNのTCP/TLS経路（443番など）も設定してください。',
            unsupported: 'このブラウザではWebRTCを利用できません。SafariまたはChromeでゲームを開いてください。'
          }[result.status] || '';
        }
      }
    } catch { /* Closing the guide cancels only this configuration check. */ }
    finally { if (this.request === request) button.disabled = probeButton.disabled = false; }
  }

  close() { this.request?.abort(); if (this.dialog.open) this.dialog.close(); }
}
