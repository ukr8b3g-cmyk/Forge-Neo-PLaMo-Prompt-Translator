import asyncio
import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, patch

repo = Path(__file__).resolve().parents[1]

for name, attributes in {
    "gradio": {},
    "gradio.context": {"get_blocks_context": None},
    "modules": {
        "script_callbacks": SimpleNamespace(**{name: lambda _: None for name in (
            "on_ui_settings", "on_before_component", "on_script_unloaded"
        )}),
        "shared": SimpleNamespace(),
    },
    "modules.options": {"options_section": None},
}.items():
    sys.modules[name] = ModuleType(name)
    sys.modules[name].__dict__.update(attributes)

spec = importlib.util.spec_from_file_location("plamo_test_subject", repo / "scripts/plamo_translator.py")
plamo = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = plamo
spec.loader.exec_module(plamo)
backend = plamo.backend


class UnloadTimer(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        plamo.active = asyncio.Lock()
        plamo.shared.opts = SimpleNamespace(
            plamo_translator_idle_seconds=0.04, plamo_translator_auto_unload=True,
        )
        self.config = {"url": "http://127.0.0.1:8123", "model": "test-model", "timeout": 30, "max_tokens": 512}
        self.key = (self.config["url"], "selected-instance")
        self.input = dict(self.config, action="translate", source="a blue sky", target="ja")
        self.chat = AsyncMock(return_value={"choices": [{"message": {"content": "a result"}, "finish_reason": "stop"}]})
        self.prepare = AsyncMock(return_value=(self.key[1], 8192))
        self.unload = AsyncMock(return_value={"instance_id": self.key[1]})
        for name, value in (("request", self.chat), ("prepare_model", self.prepare), ("unload", self.unload)):
            patcher = patch.object(backend, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    async def asyncTearDown(self):
        tasks = [entry.task for entry in plamo.idle_models.values()]
        for key in tuple(plamo.idle_models):
            plamo.stop_unload(key)
        await asyncio.gather(*tasks, return_exceptions=True)

    async def expect_delayed_unload(self):
        self.assertIn(self.key, plamo.idle_models)
        self.unload.assert_not_awaited()
        await asyncio.wait_for(asyncio.shield(plamo.idle_models[self.key].task), timeout=2)
        self.unload.assert_awaited_once_with({**self.config, "timeout": 10}, "", self.key[1])
        self.assertNotIn(self.key, plamo.idle_models)

    async def test_failed_second_translation(self):
        for status in ("server", "response", "deadline"):
            with self.subTest(status=status):
                good = self.chat.return_value
                failure = {"choices": []} if status == "response" else backend.TranslationError(status)
                self.chat.side_effect = [good, failure]
                self.unload.reset_mock()
                self.assertEqual((await plamo.handle(self.input))["status"], "translated")
                initial = plamo.idle_models[self.key].task
                self.assertEqual((await plamo.handle(self.input))["status"], status)
                await asyncio.gather(initial, return_exceptions=True)
                self.assertTrue(initial.cancelled())
                await self.expect_delayed_unload()

    async def test_segmented_operation_and_later_failure(self):
        await plamo.handle(self.input)
        previous = plamo.idle_models[self.key].task
        count = 0
        async def segment(*args):
            nonlocal count
            count += 1
            await asyncio.sleep(0.06)
            self.unload.assert_not_awaited()
            self.assertNotIn(self.key, plamo.idle_models)
            if count == 2:
                raise backend.TranslationError("server")
            return {"choices": [{"message": {"content": "first segment"}, "finish_reason": "stop"}]}
        self.chat.side_effect = segment
        result = await plamo.handle(dict(self.input, source="A" * 1400 + "\n\n" + "B" * 1400))
        self.assertEqual(result, {"status": "server"})
        self.assertEqual(count, 2)
        await asyncio.gather(previous, return_exceptions=True)
        self.assertTrue(previous.cancelled())
        await self.expect_delayed_unload()

    async def test_context_rejection_after_model_resolution(self):
        self.prepare.return_value = (self.key[1], 2)
        self.assertEqual((await plamo.handle(self.input))["status"], "context")
        self.chat.assert_not_awaited()
        await self.expect_delayed_unload()

    async def test_cancelled_server_task_after_model_resolution(self):
        started = asyncio.Event()

        async def wait_for_reply(*_):
            started.set()
            await asyncio.Future()

        self.chat.side_effect = wait_for_reply
        request = asyncio.create_task(plamo.handle(self.input))
        await asyncio.wait_for(started.wait(), timeout=2)
        self.unload.assert_not_awaited()
        request.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await request
        await self.expect_delayed_unload()

    async def test_input_error_preserves_existing_timer(self):
        await plamo.handle(self.input)
        timer = plamo.idle_models[self.key].task
        self.assertEqual(await plamo.handle(dict(self.input, source="")), {"status": "input"})
        self.assertIs(plamo.idle_models[self.key].task, timer)
        await self.expect_delayed_unload()

    async def test_disabled_and_unresolved_model(self):
        plamo.shared.opts.plamo_translator_auto_unload = False
        await plamo.handle(self.input)
        self.assertFalse(plamo.idle_models)
        plamo.shared.opts.plamo_translator_auto_unload = True
        self.prepare.side_effect = backend.TranslationError("modelNotFound")
        self.assertEqual(await plamo.handle(self.input), {"status": "modelNotFound"})
        self.assertFalse(plamo.idle_models)
        self.unload.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
