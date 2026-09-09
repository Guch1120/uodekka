# マルチプレイ通信

## WebSocketゲームサーバー

マルチプレイはPeerJS/WebRTCの端末間接続から、Cloudflare WorkersのWebSocketゲームサーバー経由へ移行しました。PC・スマホは全て `wss://` で同じサーバーへ接続するため、STUN/TURNや端末間NAT越えの設定は不要です。

- Worker：`worker/index.js`
- ブラウザ側：`backend/network/websocket_manager.js`
- Wrangler設定：`wrangler.toml`

Cloudflare DashboardまたはWranglerで `wrangler.toml` を使ってデプロイします。Durable Objectの初回デプロイでは `new_sqlite_classes` のマイグレーションが適用されます。現在の公開エンドポイントは `wss://uodekka-multiplayer.kurehiro1009.workers.dev/ws` で、Vercel配信の `index.html` に設定済みです。

サーバーはルームID、最大8人の参加者、ホスト権限、コース、開始状態をDurable ObjectのSQLiteストレージへ保存します。ホストがコースを決め、サーバーが権限を検証して全員へ配信します。車両状態とアイテムイベントもサーバー経由で中継します。Workerの再起動後も保存済みのルーム情報を読み込みますが、切断済みのWebSocket自体は復旧しないため、クライアントが自動再接続します。

接続失敗の表示、自動再接続、ルーム状態の再取得を実装しています。Durable Objectがルーム単位の単一管理者になるため、別サーバーのRedisを追加しなくても同じルームの状態が一貫します。

## 動作確認

`pnpm dlx wrangler dev --local` でローカルWorkerを起動し、ルーム作成・参加の接続を確認できます。公開前は `pnpm dlx wrangler deploy --dry-run`、公開後はルーム作成・参加、メンバー同期、ホストのコース権限、開始通知、車両状態中継、存在しないルームのエラーを実接続で確認します。ブラウザ側の既存UIテストは `tests/lobby_ui.cjs`、`tests/smoke.cjs` を使用します。

実機検証では、PC同士、PCとスマホ、スマホ同士、同一Wi-Fiと携帯回線、iPhone SafariとAndroid Chromeを確認します。サーバー再起動、短時間の切断、画面復帰、満員、無効なIDも対象にします。
