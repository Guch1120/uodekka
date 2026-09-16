# マルチプレイ通信

## WebSocketゲームサーバー

マルチプレイはPeerJS/WebRTCの端末間接続から、Cloudflare WorkersのWebSocketゲームサーバー経由へ移行しました。PC・スマホは全て `wss://` で同じサーバーへ接続するため、STUN/TURNや端末間NAT越えの設定は不要です。

- Worker：`worker/index.js`
- ブラウザ側：`backend/network/websocket_manager.js`
- Wrangler設定：`wrangler.toml`

Cloudflare DashboardまたはWranglerで `wrangler.toml` を使ってデプロイします。Durable Objectの初回デプロイでは `new_sqlite_classes` のマイグレーションが適用されます。現在の公開エンドポイントは `wss://uodekka-multiplayer.kurehiro1009.workers.dev/ws` で、Vercel配信の `index.html` に設定済みです。

サーバーはルームID、最大8人の参加者、ホスト権限、コース、開始状態をDurable ObjectのSQLiteストレージへ保存します。ホストがコースを決め、サーバーが権限を検証して全員へ配信します。車両状態とアイテムイベントもサーバー経由で中継します。Workerの再起動後も保存済みのルーム情報を読み込みますが、切断済みのWebSocket自体は復旧しないため、クライアントが自動再接続します。

接続失敗の表示、自動再接続、ルーム状態の再取得を実装しています。Durable Objectがルーム単位の単一管理者になるため、別サーバーのRedisを追加しなくても同じルームの状態が一貫します。

## ミッション形式スキルアップシステムの同期

`backend/missions/mission_definitions.js` の `MISSION_SPEC_VERSION` を仕様バージョンとして使用します。

- **仕様バージョンの申告と照合**：`CREATE_ROOM`/`JOIN_ROOM` 送信時にクライアントが `specVersion` を申告し、サーバーがルームメンバーごとに保存します。ホストが `START_RACE` を送るタイミングで、サーバーは全メンバーの `specVersion` が一致しているかを検証し、不一致なら `ROOM_ERROR`（`code: 'spec-mismatch'`）を返してレースを開始しません。クライアント側でも受信した `START_RACE.specVersion` を自分の `MISSION_SPEC_VERSION` と比較する防御的チェックを行います（通常はサーバー側チェックで弾かれるため、こちらが発火するのは想定外の状態のみです）。
- **START_RACE**：ホストが `drawMission()` で参加者・CPU全員分のミッションを抽選した `missionAssignments`（`{ racerId: missionId }`）と、コース別CPU学習データから算出した `cpuLevel` を計算し、`aiRacers`・`specVersion` と共に送信します。サーバーは型を検証し、不正な場合は空オブジェクト／`1` にフォールバックしてから全員へ中継します。同一車体の別レーサーが同じミッションになることは許容します。
- **KART_STATE / CPU_STATES**：既存の位置・速度等と同様に、ミッションID・累計進捗・達成段階・救済状態・固有スキルのクールダウン/発動状態を毎回まるごと送信します。受信側は表示用フィールド（`otherPlayers` エントリの `missionDisplay`/`skillDisplay`）へ最新値で上書きするだけで、報酬の再適用（数値強化の再計算や固有スキル追加効果の付与）は一切行いません。人間の進捗はその車体を操作するクライアントが、CPUの進捗はホストのみが更新します。
- **再同期**：ミッション専用の再同期メッセージはなく、既存のKART_STATE/CPU_STATESの「最新値で置換」方式がそのまま「累積状態の置換・報酬の再加算なし」を満たします。

## 動作確認

`pnpm dlx wrangler dev --local` でローカルWorkerを起動し、ルーム作成・参加の接続を確認できます。公開前は `pnpm dlx wrangler deploy --dry-run`、公開後はルーム作成・参加、メンバー同期、ホストのコース権限、開始通知、車両状態中継、存在しないルームのエラーを実接続で確認します。ブラウザ側の既存UIテストは `tests/lobby_ui.cjs`、`tests/smoke.cjs` を使用します。ミッション形式スキルアップシステムのワイヤーフォーマット（`missionAssignments`/`cpuLevel`/`specVersion`の中継とバージョン不一致時の拒否）は `tests/test_mission_wire.mjs` で検証します。

実機検証では、PC同士、PCとスマホ、スマホ同士、同一Wi-Fiと携帯回線、iPhone SafariとAndroid Chromeを確認します。サーバー再起動、短時間の切断、画面復帰、満員、無効なIDも対象にします。マルチプレイ特有の確認として、ホスト・ゲスト双方で同一のミッション抽選・CPUレベルになること、レース中の進捗・段階達成・救済の見え方がホスト/ゲストで矛盾しないこと、`specVersion` が異なるビルド同士でレースが開始されないことを追加で確認します。
