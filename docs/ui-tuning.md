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
