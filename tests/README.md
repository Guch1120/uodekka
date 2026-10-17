# ブラウザ回帰テスト

実行環境と依存関係はコンテナ内に閉じています。

```bash
docker build -f tests/Dockerfile -t uodekka-browser-test .
docker run --rm uodekka-browser-test
```

Chromiumでタイトルからソロ走行、キー解放、フォーカス喪失、ポーズ、ボタン外解放、未所持アイテム入力の消費、HUDのDOM再利用、リスタートを確認します。タッチキャンセルは合成イベントによる検証です。実機ジャイロと複数端末のP2P通信は対象外です。

公開サイトを同じテストで確認する場合は環境変数 GAME_URL を指定します。

開始前UIの回帰テストは、同じサーバー・Playwright環境で `node tests/lobby_ui.cjs` を実行します。名前・車体選択、ポップアップ、招待URL、閲覧と確定の分離、ランダム決定、レースへの情報引き渡し、縦横画面の横はみ出しを確認します。`PLAYWRIGHT_MODULE` と `CHROME_PATH` で既存のローカル実行環境も指定できます。

アプリ切り替えからの復帰は `node tests/app_resume_layout.cjs` で検証します。CSS強制横画面と実際の横向き端末について、復帰直後の一時的な画面寸法が安定した後も横画面レイアウトを保持することを確認します。

高さ付きエディタは `node tests/editor_elevation.cjs` で検証します（実行環境の指定はロビー用と同じ）。高さのドラッグと平面形状の保持、元に戻す、平坦化、保存と再読み込み、周回のつなぎ目、路面と車体の高さ一致、CPUの登坂、ソロからの選択、スマホ縦横表示を確認します。

通信の追加検証：
- `node tests/p2p_recovery.mjs`：再試行、キャンセル、ルーム情報再取得、接続案内の復旧、診断の秘匿。
- `node tests/ice_config.mjs`：TURN設定取得、短期認証情報、未設定・サービス障害時の応答。
- `node tests/p2p_browser.cjs`：実PeerJSによるブラウザ間接続とスマホ幅の画面。既定URLはlocalhost:8100。`FORCE_RELAY=1` は設定済みの実TURNサービスを使い中継経路を検証します。サービス未設定では成功しません。
- `node tests/test_cpu_sync.mjs`：WebSocketManagerのCPU状態送信・背圧制御、Cloudflare WorkerのRoomによるCPU状態中継・ホスト権限検証、20Hzスロットリングとレンダリングループの例外耐性。フレームワーク不要（Node単体で実行可）。

ミッション形式スキルアップシステムの検証：
- `node tests/test_mission_engine.mjs`：4車体×3ミッションの重複なし、累積進捗の段階跨ぎ、数値強化の1/3・2/3・3/3境界値、報酬の一度きり適用、代替報酬/スキル解放の分岐、救済の発動条件と持続、コース属性による抽選除外、CPU Lv.4/Lv.5境界を検証します。Node単体で実行可（THREE.js非依存）。
- `node tests/test_unique_skills.mjs`：固有スキルのクールダウン計算、2段階/3段階追加効果が発動につき1回だけ・次回発動から適用されること、再発動時の残留状態クリアを検証します。Node単体で実行可。
- `node tests/test_mission_wire.mjs`：`START_RACE`の`missionAssignments`/`cpuLevel`/`specVersion`の送信・中継・不正値のサニタイズ、`specVersion`不一致時のクライアント側/サーバー側それぞれの開始拒否を検証します。Node単体で実行可。
- `node tests/verify_mission_ui.mjs`：Docker/Playwright環境でガレージのミッションモーダル・車体切替・HUDミッショントラッカー・段階達成の非ブロッキング通知・リザルト画面のミッションサマリーを実ブラウザで確認します（`tests/smoke.cjs`と同じ実行方法）。
- `node tests/multiplayer_devices.mjs`：実機複数台の代わりに、完全に独立した2つのブラウザプロセス（別Cookie/localStorage）を、ローカルで起動した`wrangler dev`（Miniflare、ログイン・Cloudflareアカウント・実デプロイ不要）経由の同一ルームへ接続させ、ホスト/ゲスト間で本物のWebSocket通信を検証します。ミッション抽選(`missionAssignments`)とCPUレベル(`frozenCpuLevel`)がホスト・ゲストで完全一致すること、`KART_STATE`によるホストの走行のリアルタイム反映、`CPU_STATES`によるホストローカルCPUのゲスト側への中継を確認します。`tests/Dockerfile`で`wrangler`を含め`npm install`済みの環境が必要です（`node tests/multiplayer_devices.mjs`単体では`npx wrangler`がローカルに解決できる環境が必要）。

フィードバック・横持ちUI・ドリフトの回帰検証：
- `node tests/feedback_api.cjs`：ソースと配信用APIの両方で画像保存→Issue本文を確認します。GitHubは模擬し、外部へ送信しません。
- `node tests/feedback_browser.cjs`：ファイル選択・JPEG変換・POST・受領結果表示を模擬APIで確認します。
- `node tests/drift_input.cjs`：ボタン長押しとキー操作の併用・解放・ターボ状態表示を確認します。
- `node tests/mobile_viewport.cjs`：実表示領域とCSS viewportが異なる状態を模擬し、ルート寸法を確認します。
- `node tests/mobile_lobby.cjs`：横持ちホーム・シングルの主要操作が画面内に収まることを確認します。

ブラウザ用テストは既存Dockerコンテナ内のPlaywrightと `tests/server.cjs` を使います。

痕跡・回復ゲートは `node tests/test_track_effects.mjs`（描画非依存）と `node tests/track_effects_browser.cjs`（Playwright）で確認します。`tests/multiplayer_devices.mjs` にはゲスト発動→ホスト配置→寿命共有の実WebSocket回帰も含みます。実行はDocker内です。

`node tests/modal_layout.cjs` はCSS回転・実横画面・表示領域縮小時の設定、リザルト、画像5枚選択と公開情報展開時のフィードバックについて、カードと主要操作がアプリ領域に収まることを確認します。`feedback_browser.cjs` は複数選択・追加・×削除・キャンセル・上限・失敗時の保持・公開情報の境界を模擬APIで検証し、実GitHub保存は本番で別途確認します。
