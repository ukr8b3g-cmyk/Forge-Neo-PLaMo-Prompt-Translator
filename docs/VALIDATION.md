# v1.1 validation / 検証範囲

Checked on Windows on 2026-11-16.

## Automated checks

- 14 translation tests cover language validation, configured output limits, paragraph ordering, splitting after cutoff/context-limit errors, whole-operation timeout, input/output bounds, and malformed responses.
- 6 unload tests cover successful and failed translations, cancellation, preserving a prior timer after invalid input, disabled auto-unload, and a failure during a multi-segment operation. Network responses are mocked in these tests.
- These 20 tests passed in the installed Forge Neo Python 3.13 and reForge Python 3.10 environments. Run them using the WebUI's Python:

```sh
python -B -m unittest discover -s tests -v
```

- Isolated browser checks covered English at 1440 px and Japanese at 650/390 px: language menus and persistence, token setting persistence, Send/Undo, the unsaved-connection unload guard, and rejection of partial, stale, or canceled results. Toolbar controls remained 32 px high; the cutoff warning was readable within two lines without scrolling.

## Actual Forge Neo and LM Studio

The installed Forge Neo code was started with separate test data and Gradio 4.40.0, using the running LM Studio server and PLaMo 3 Translate 0.8B Q4_K_M.

- Japanese → English, English → Japanese, Korean → English, Chinese → English, Thai → English, and English → Simplified Chinese.
- One Translate click for 14,098 English characters produced 5,772 Japanese characters over eight LM Studio requests, totaling 2,605 completion tokens. Each request used an output limit of 2048; the combined result exceeded that per-request limit.
- Checked the beginning and end of the long result, full-result Add/Rep and Undo, Positive input events, unchanged Negative, and separate img2img translation and Send.
- In Compact mode, both tabs returned from Lora to Generation with the panel below Positive and with source text and languages retained.
- Test services were stopped afterward. Existing WebUI settings and loaded LM Studio model IDs/configurations were preserved.

Image generation, Japanese IME, and broad coexistence with other prompt extensions were not tested for v1.1. reForge's live integration was tested in the preceding compatibility update; this version was checked in reForge's Python environment, not its live UI.

## 日本語

2026-11-16にWindowsで確認しました。

- 翻訳14件・アンロード6件の計20テストが、Forge NeoのPython 3.13とreForgeのPython 3.10で通過。分割順序、途中終了後の再分割、全体タイムアウト、入力検証、失敗・中止・複数区間処理後のタイマー復元を確認しています。これらの通信は模擬です。
- 分離したブラウザーで英語1440px、日本語650px・390pxを確認。言語とトークン設定の保存、Send・Undo、接続設定の未保存時のアンロード禁止、未完了・古い・中止済みの訳文の送信防止を確認しました。操作列の高さは32pxで、途中終了の警告はスクロールせず2行以内で読めます。
- 常用と同じForge Neo本体を分離データで起動し、実LM StudioのPLaMo 3 Translate 0.8B Q4_K_Mで多言語6方向を翻訳しました。
- 英語14,098文字をTranslate1回で翻訳し、8リクエスト・計2,605出力トークン、日本語5,772文字へ結合。先頭と末尾、全文の追記・置換・Undo、Positiveへの入力イベント、Negativeの保持、img2imgの独立した翻訳・反映を確認しました。
- Compactの両タブでLoraからGenerationへ戻り、Positive直下の配置・原文・言語選択が保持されました。
- 検証サービスは終了済みで、既存のWebUI設定とLM Studioのロード済みモデル・読み込み設定を保持しました。

v1.1では画像生成、日本語IME、ほかのプロンプト編集拡張との広範な共存は未検証です。reForgeの実画面は前回の互換対応時に確認済みですが、今回はPython環境での確認までです。
