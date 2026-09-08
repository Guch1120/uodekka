# ブラウザ回帰テスト

実行環境と依存関係はコンテナ内に閉じています。

```bash
docker build -f tests/Dockerfile -t uodekka-browser-test .
docker run --rm uodekka-browser-test
```

Chromiumでタイトルからソロ走行、キー解放、フォーカス喪失、ポーズ、ボタン外解放、未所持アイテム入力の消費、HUDのDOM再利用、リスタートを確認します。タッチキャンセルは合成イベントによる検証です。実機ジャイロと複数端末のP2P通信は対象外です。

公開サイトを同じテストで確認する場合は環境変数 GAME_URL を指定します。
