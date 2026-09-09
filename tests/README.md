# ブラウザ回帰テスト

実行環境と依存関係はコンテナ内に閉じています。

```bash
docker build -f tests/Dockerfile -t uodekka-browser-test .
docker run --rm uodekka-browser-test
```

Chromiumでタイトルからソロ走行、キー解放、フォーカス喪失、ポーズ、ボタン外解放、未所持アイテム入力の消費、HUDのDOM再利用、リスタートを確認します。タッチキャンセルは合成イベントによる検証です。実機ジャイロと複数端末のP2P通信は対象外です。

公開サイトを同じテストで確認する場合は環境変数 GAME_URL を指定します。

開始前UIの回帰テストは、同じサーバー・Playwright環境で `node tests/lobby_ui.cjs` を実行します。名前・車体選択、ポップアップ、招待URL、閲覧と確定の分離、ランダム決定、レースへの情報引き渡し、縦横画面の横はみ出しを確認します。`PLAYWRIGHT_MODULE` と `CHROME_PATH` で既存のローカル実行環境も指定できます。

高さ付きエディタは `node tests/editor_elevation.cjs` で検証します（実行環境の指定はロビー用と同じ）。高さのドラッグと平面形状の保持、元に戻す、平坦化、保存と再読み込み、周回のつなぎ目、路面と車体の高さ一致、CPUの登坂、ソロからの選択、スマホ縦横表示を確認します。

通信の追加検証：
- `node tests/p2p_recovery.mjs`：再試行、キャンセル、ルーム情報再取得、接続案内の復旧、診断の秘匿。
- `node tests/ice_config.mjs`：TURN設定取得、短期認証情報、未設定・サービス障害時の応答。
- `node tests/p2p_browser.cjs`：実PeerJSによるブラウザ間接続とスマホ幅の画面。既定URLはlocalhost:8100。`FORCE_RELAY=1` は設定済みの実TURNサービスを使い中継経路を検証します。サービス未設定では成功しません。
