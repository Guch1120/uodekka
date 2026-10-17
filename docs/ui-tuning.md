# UIサイズの調整箇所

実機とブラウザの表示差は、端末の viewport・pixel ratio・safe area によって発生します。まず同じ向き、同じ viewport サイズで比較してください。

## 共通ボタン

共通のモーダルボタンは `css/modals.css` の以下を調整します。

- `.primary-btn`: 主要ボタンの `padding`、文字サイズ、角丸
- `.action-btn`: 通常の操作ボタン
- `.btn-secondary`: 補助ボタン
- `.btn-sm`: 小型ボタン

画面や端末ごとに変える場合は、共通値を直接変更せず、`css/responsive-scrollfree.css` または対象画面のCSSでメディアクエリを追加します。例えば横画面の更新通知ボタンは `.update-confirm-btn`、フィードバック送信ボタンは `#feedback-modal .primary-btn` です。

## 実機差の確認

ブラウザの開発者ツールで端末プリセットを選び、次の値を揃えて確認します。

```text
viewport width / height
device pixel ratio
portrait / landscape
ブラウザのアドレスバー表示状態
```

実機ではアドレスバーやsafe areaの影響で高さが変わるため、固定pxを増やすより `max-height`、`dvh`、既存の `data-is-compact` 用ルールを優先してください。

## 横持ちホーム・コース選択の比率配置

`index.html` が取得した実表示領域を `--app-width` / `--app-height` として使用します。SafariのブラウザUIで高さが変化した場合も、`#app` とロビーの基準を同じにします。

横持ちのコンパクト表示では、ヘッダーを除く残りを `main` に割り当て、左右の列は既存の `1.15fr : 1fr` を維持します。ホームのソロ・マルチのモードカードは概ね `1 : 1`、車体プレビューとコースプレビューは残りの領域へ伸縮します。文字・操作ボタンに最低サイズを残し、コース選択の車体情報カードは必要な場合だけ内部スクロールします。端末名による分岐や画面全体の画像的な縮小は行いません。

`tests/mobile_lobby.cjs` は横持ちiPhone 16・Pixel 9相当サイズと表示高さ縮小時のホーム／シングルの主要ボタン到達性を確認します。実機Safariの検証とは区別してください。
