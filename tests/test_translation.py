import asyncio
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("tested_plamo_backend", ROOT / "plamo_backend.py")
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


def completion(text, reason="stop"):
    return {"choices": [{"message": {"content": text}, "finish_reason": reason}]}


class Translation(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.config = backend.settings({"url": "http://localhost:1234", "model": "fixture", "timeout": 60})
        self.prepare = AsyncMock(return_value=("fixture-instance", 32768))
        self.request = AsyncMock(return_value=completion("translated"))
        for name, value in (("prepare_model", self.prepare), ("request", self.request)):
            p = patch.object(backend, name, value)
            p.start()
            self.addCleanup(p.stop)

    async def translate(self, source="hello", target="ja", source_lang="auto", **kwargs):
        return await backend.translate(self.config, "", source, target, source_lang=source_lang, **kwargs)

    async def test_all_languages_and_auto(self):
        self.assertEqual(len(set(backend.LANGUAGES)), 53)
        for target in backend.LANGUAGES:
            self.assertEqual((await self.translate(target=target))["status"], "translated")
            payload = self.request.call_args.args[3]
            self.assertIn("target_lang=" + target, payload["messages"][0]["content"])
            self.assertNotIn("source_lang", payload["messages"][0]["content"])
        await self.translate(source_lang="ko")
        self.assertIn("source_lang=ko", self.request.call_args.args[3]["messages"][0]["content"])

    async def test_invalid_languages_never_load(self):
        for target, source in (("auto", "auto"), ("xx", "en"), ("en", "xx")):
            with self.assertRaisesRegex(backend.TranslationError, "language"):
                await self.translate(target=target, source_lang=source)
        self.prepare.assert_not_awaited()

    async def test_token_settings_and_legacy_default(self):
        self.assertEqual(self.config["max_tokens"], 512)
        for cap in (256, 512, 1024, 2048):
            self.config["max_tokens"] = cap
            await self.translate()
            self.assertEqual(self.request.call_args.args[3]["max_tokens"], cap)
        for invalid in (True, "512", 0, 999):
            with self.assertRaisesRegex(backend.TranslationError, "tokens_value"):
                backend.settings({**self.config, "max_tokens": invalid})

    async def test_long_text_keeps_order_and_paragraphs(self):
        source = "\n\n".join(letter * 1400 for letter in "ABCD")
        self.request.side_effect = lambda *args: completion(args[3]["messages"][1]["content"])
        on_use = []
        reply = await self.translate(source, on_use=on_use.append)
        self.assertEqual(reply, {"status": "translated", "text": source})
        self.assertEqual(on_use, ["fixture-instance"])
        self.prepare.assert_awaited_once()
        self.assertEqual(self.request.await_count, 4)
        self.assertTrue(all(len(c.args[3]["messages"][1]["content"]) <= 2000 for c in self.request.call_args_list))

    async def test_cutoff_retries_smaller_pieces_without_duplicating_partial(self):
        self.request.side_effect = [completion("discard this", "length"), completion("first"), completion("second")]
        reply = await self.translate("A" * 500 + "\n\n" + "B" * 500)
        self.assertEqual(reply, {"status": "translated", "text": "first\n\nsecond"})

    async def test_context_limit_retries_but_server_failure_does_not(self):
        self.request.side_effect = [backend.TranslationError("context"), completion("one"), completion("two")]
        self.assertEqual((await self.translate("A" * 500 + "\n\n" + "B" * 500))["status"], "translated")
        self.request.reset_mock()
        self.request.side_effect = backend.TranslationError("server")
        with self.assertRaisesRegex(backend.TranslationError, "server"):
            await self.translate("A" * 1400 + "\n\n" + "B" * 1400)
        self.request.assert_awaited_once()

    async def test_context_preflight_splits_long_piece(self):
        self.prepare.return_value = ("fixture-instance", 1200)
        self.request.side_effect = lambda *args: completion(args[3]["messages"][1]["content"])
        reply = await self.translate("A" * 500 + "\n\n" + "B" * 500)
        self.assertEqual(reply["status"], "translated")
        self.assertEqual(self.request.await_count, 2)

    async def test_terminal_cutoff_stops_and_remains_partial(self):
        self.request.return_value = completion("short result", "length")
        reply = await self.translate("A" * 1000 + "\n\n" + "B" * 1000)
        self.assertEqual(reply, {"status": "partial", "text": "short result"})
        self.assertLess(self.request.await_count, 10)

    async def test_context_too_small_is_reported(self):
        self.prepare.return_value = ("fixture-instance", 2)
        with self.assertRaisesRegex(backend.TranslationError, "context"):
            await self.translate()
        self.request.assert_not_awaited()

    async def test_input_limit_and_syntax_before_model_load(self):
        cases = [
            ("A" * 16001, "size"),
            ("", "input"),
            ("<lora:fixture:1>", "syntax"),
            ("(red coat:1.2)", "syntax"),
            ("(red (winter coat):1.2)", "syntax"),
            ("[night:day:0.5]", "syntax"),
            ("[cat|dog]", "syntax"),
            ("cat BREAK dog", "syntax"),
            ("__season__", "syntax"),
            ("<|plamo:tag|>", "syntax"),
        ]
        for text, error in cases:
            with self.assertRaisesRegex(backend.TranslationError, error):
                await self.translate(text)
        self.prepare.assert_not_awaited()
        self.request.assert_not_awaited()

    async def test_ordinary_punctuation_reaches_translation_unchanged(self):
        sources = [
            "A woman (adult) in a red coat.",
            "Camera [front view].",
            "開始時間: 10",
            "成人の女性（赤いコート）。",
            r"Open C:\Pictures\reference.jpg.",
        ]
        for source in sources:
            with self.subTest(source=source):
                self.request.return_value = completion(source)
                self.assertEqual(await self.translate(source), {"status": "translated", "text": source})
                payload = self.request.call_args.args[3]
                self.assertEqual(payload["messages"][1]["content"], source)

    async def test_total_deadline_covers_all_pieces(self):
        self.config["timeout"] = 0.07
        async def slow(*_):
            await asyncio.sleep(0.045)
            return completion("part")
        self.request.side_effect = slow
        with self.assertRaises(TimeoutError):
            await self.translate("A" * 1400 + "\n\n" + "B" * 1400)
        self.assertEqual(self.request.await_count, 2)

    async def test_joined_output_limit(self):
        self.request.return_value = completion("A" * 40000)
        with self.assertRaisesRegex(backend.TranslationError, "output_size"):
            await self.translate("A" * 1400 + "\n\n" + "B" * 1400)

    async def test_malformed_completion_not_accepted_or_retried(self):
        self.request.return_value = {"choices": []}
        with self.assertRaisesRegex(backend.TranslationError, "response"):
            await self.translate()
        self.request.assert_awaited_once()

    def test_boundary_fallbacks_preserve_source(self):
        for text in ("a\n\nb", "a\nb", "a。b", "a. b", "a b", "abc", "😀" * 90):
            head, separator, tail = backend.split_source(text, 1, max(1, len(text) // 2))
            self.assertEqual(head + separator + tail, text)
            self.assertTrue(head and tail)


if __name__ == "__main__":
    unittest.main()
