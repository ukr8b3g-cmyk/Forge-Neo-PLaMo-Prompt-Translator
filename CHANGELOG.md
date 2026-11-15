# Changes / 変更履歴

## v1.1 — 2026-11-16

- Select among 53 languages, with Auto source detection and explicit target selection. English, Simplified Chinese, Traditional Chinese, and Japanese appear first.
- Keep the compact panel; use the direction button's dropdown to choose languages and swap two explicit languages with one click. Remember language choices and accordion state per tab.
- Translate long text with one click: split at paragraph, line, sentence, or word boundaries, retry smaller pieces after a cutoff or context-limit error, and join results in order.
- Configure 256 / 512 / 1024 / 2048 output tokens per request. Keep incomplete results from being sent to Positive; count auto-unload idle time after the whole operation ends, including errors.
- Update English and Japanese setup instructions and screenshots. Include reForge compatibility and the unload/accordion fixes published to main after v0.9.

### 日本語

- 53言語に対応。原文は自動認識が基本で、翻訳先は明示的に選択します。英語・中国語の簡体字／繁体字・日本語を先頭に表示します。
- 薄型パネルを維持し、方向ボタン横のメニューで言語を選択。言語指定時はワンクリックで入れ替え、タブごとに言語選択・開閉状態を記憶します。
- 長文はTranslateを1回押すだけで段落などの切れ目で分割・翻訳・結合。途中終了やコンテキスト不足では、該当区間を小さくして再翻訳します。
- 1リクエストの出力上限を256／512／1024／2048トークンから設定。未完了訳のSendを防ぎ、失敗時も含めて処理全体の終了後から自動アンロードの待ち時間を数えます。
- 英語・日本語の説明と画像を更新。v0.9以降にmainへ追加したreForge互換対応、アンロード修正、開閉記憶も含みます。

## v0.9 — 2026-11-15

Initial Japanese–English release for Forge Neo, with local LM Studio translation, Send/Add/Rep/Undo, model loading, and unload controls. The original tag and release are unchanged.

Forge Neo向けの日英・英日翻訳の初回リリース。LM Studio接続、Send・追記・置換・Undo、モデルのロード・アンロードに対応。既存のタグとリリースは保持しています。
