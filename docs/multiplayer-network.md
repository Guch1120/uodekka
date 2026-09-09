# マルチプレイの接続設定

## 今回の修正と、必要な外部設定

PeerJSの標準TURNホストへの依存を削除し、`/api/ice-servers` から取得したICE設定をホスト・ゲストの両方に適用します。ルーム・車体・コース同期のプロトコルは維持しています。

**設定だけ用意しても中継サービスは作成されません。TURNサービスの認証情報を設定するまでは、直接接続できない回線でのタイムアウトは解消したと判断できません。** 設定がない場合、画面に中継が未設定である旨を表示し、Google STUNを利用した直接接続のみを試します。存在しないTURNホストやダミー認証情報は使用しません。

## 方法A：Metered

MeteredでアプリとTURN credentialを作成し、Vercelの対象プロジェクトの Environment Variables に以下を設定します。

| 名前 | 内容 |
|---|---|
| `METERED_DOMAIN` | アプリのドメイン（`アプリ名.metered.live`、https:// やパスを含めない） |
| `METERED_TURN_API_KEY` | TURN credential の「Show API Key」で取得するキー |

管理用Secret Key・Realtimeのpublishable keyとは別です。キーをGitや公開ファイルに書かないでください。公開環境（Production）に設定し、環境変数の反映のため再デプロイします。発行したTURN credentialの期限・利用量上限はサービス側で管理してください。

サーバーが公式のGet TURN Credential APIを呼び出し、ブラウザにはICE接続に必要な情報のみを返します。APIキーは返しません。プロバイダーが返すUDP / TCP / TLSのURLをそのまま使用し、対応していないURLを推測して作成しません。

公式手順：
- https://www.metered.ca/docs/turn-rest-api/get-credential/
- https://www.metered.ca/docs/turn-server-service/creating-turn-credentials/

## 方法B：自前のcoturn

REST認証（use-auth-secret）を有効にした稼働中のcoturnを使う場合は以下を設定します。方法Aと両方指定した場合はMeteredが優先されます。

| 名前 | 内容 |
|---|---|
| `TURN_URLS` | 自分のサーバーのTURN URLをカンマ区切りで指定 |
| `TURN_SHARED_SECRET` | coturnのstatic-auth-secretと同じ秘密鍵 |

UDP、TCP、TLSの各リスナー、証明書、DNS、リレーポートの開放をサーバー側で行ってください。コードにURLを指定するだけではリスナーは有効になりません。TLSを443番で提供する場合、そのポートのサービス競合にも注意してください。

APIが有効期限10分の一意なusernameとHMAC-SHA1 credentialを生成します。共有秘密鍵はブラウザへ返しません。

## APIと公開ファイル

- 元ファイル：`api/ice-servers.cjs`
- Vercel配信先：`.vercel/output/functions/api/ice-servers.func/index.cjs`
- Function設定：同ディレクトリの `.vc-config.json`（Node.js 22）
- 公開URL：`/api/ice-servers`
- クライアント：`backend/network/ice_config.js`

現在の配信方式はBuild Output APIの出力を使用するため、ソースにAPIを追加するだけでは配信されません。修正時はFunctionのコピーと `.vercel/output/static` 内の配信ファイルも同期してください。認証情報を含む環境変数はProject Settingsで設定し、出力JSONには記録しません。

レスポンスは `Cache-Control: private, no-store`。未設定時は200と `relayConfigured:false`、設定不備やサービス障害時は503になります。アプリの画面は後者の場合も直接接続だけで試せる旨を表示します。公衆向けゲームなので接続用credential自体は利用者に配布されます。TURN利用量の上限とVercel側のAPIレート制限を運用時に設定してください。

## 接続動作

1. 中継設定を取得（最大8秒。上流APIの待ち時間は5秒）。
2. PeerJS Cloudに接続（最大15秒）。
3. ホストとの経路を確立（通常20秒。ICE候補などの進捗がある場合は猶予を延長し、経路確立とルーム情報受信を合わせて最大40秒）。
4. ルーム情報を受信（経路確立後最大10秒。未受信時は1秒ごとに要求）。
5. 再試行可能な障害の場合だけ、新しいPeerで1回再試行。TURN設定がある場合は2回目を中継経由に限定。
6. 存在しないID・満員・開始済みなどは自動再試行しない。ポップアップを閉じると接続・待機をキャンセル。

接続案内サーバーだけが一時切断された場合は2回まで再接続し、既存の端末間通信とルームを維持します。復旧しない場合は新規参加を受け付けられない旨を表示します。端末間の接続自体が切れた場合のレース途中の復帰は今回の対象外です。

## 診断と検証

「接続診断をコピー」で、接続段階・試行回数・ICE候補の種類・エラー番号を取得できます。ルームID、プレイヤー名、IPアドレス、SDP、認証情報は含めません。ブラウザが統計APIに対応する場合は、確立した経路が中継か直接かも記録します。

以下を実施してください。
- APIが200かつ `relayConfigured:true` を返すこと。
- 強制中継テストで `selected-route` の `relay:true` が確認できること。
- PCホスト→スマホゲスト、スマホホスト→スマホゲスト。
- 同一Wi-Fi、Wi-Fi＋携帯回線、異なる回線。
- ホストは画面を開いたままにする。失敗時は両端末の診断を採取する。

`node tests/p2p_browser.cjs` は実際のPeerJS CloudとWebRTCを使う同一マシン上の検証です。実機や携帯回線の検証を代替しません。`FORCE_RELAY=1` で両端末の接続を中継限定にできます。TURN未設定の場合は失敗として扱います。

ローカル起動：`PORT=8100 node tests/server.cjs`
テスト：`node tests/p2p_lobby.mjs`、`node tests/p2p_recovery.mjs`、`node tests/ice_config.mjs`
ブラウザ：`GAME_URL=http://localhost:8100 node tests/p2p_browser.cjs`
既存のPlaywrightを使う場合は `PLAYWRIGHT_MODULE` と `CHROME_PATH` でパスを指定できます。
