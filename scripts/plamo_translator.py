"""Forge integration for the PLaMo translation panel."""

import asyncio
import importlib.util
import logging
import time
import weakref
from dataclasses import dataclass
from pathlib import Path

import gradio as gr
from gradio.context import get_blocks_context

from modules import script_callbacks, shared
from modules.options import options_section

backend_spec = importlib.util.spec_from_file_location(
    "forge_plamo_backend", Path(__file__).resolve().parents[1] / "plamo_backend.py"
)
backend = importlib.util.module_from_spec(backend_spec)
backend_spec.loader.exec_module(backend)

PREFIX = "plamo_translator_"
TABS = ("txt2img", "img2img")
DEFAULTS = {
    "url": backend.DEFAULT_URL,
    "model": backend.DEFAULT_MODEL,
    "timeout": backend.DEFAULT_TIMEOUT,
    "auto_unload": False,
    "idle_seconds": 300,
}
active = asyncio.Lock()
builds = weakref.WeakKeyDictionary()
logger = logging.getLogger(__name__)


@dataclass
class IdleModel:
    config: dict
    token: str
    finished_at: float
    task: asyncio.Task | None = None


idle_models = {}


def register_settings():
    labels = {
        "url": "LM Studio の接続先",
        "model": "LM Studio のモデル ID",
        "timeout": "翻訳のタイムアウト（秒）",
        "auto_unload": "自動アンロード",
        "idle_seconds": "アンロードまでの待ち時間（秒）",
    }
    entries = {
        PREFIX + key: shared.OptionInfo(default, labels[key])
        for key, default in DEFAULTS.items()
    }
    # Persist via Forge's options file. The panel owns the controls for these keys.
    for key, info in options_section((None, "Hidden Options"), entries).items():
        shared.opts.add_option(key, info)


def save_defaults(config):
    previous = {PREFIX + key: shared.opts.data.get(PREFIX + key) for key in DEFAULTS}
    try:
        for key, value in config.items():
            name = PREFIX + key
            if getattr(shared.opts, name) != value and not shared.opts.set(name, value):
                raise RuntimeError("Setting is read-only")
        shared.opts.save(shared.config_filename)
    except (OSError, RuntimeError, AssertionError):
        for name, value in previous.items():
            if value is None:
                shared.opts.data.pop(name, None)
            else:
                shared.opts.data[name] = value
        raise backend.TranslationError("save") from None


async def unload_when_idle(key, model, deadline):
    task = asyncio.current_task()
    try:
        await asyncio.sleep(max(0, deadline - time.monotonic()))
        async with active:
            if idle_models.get(key) is not model or model.task is not task:
                return
            await backend.unload(model.config, model.token, key[1])
    except backend.TranslationError as error:
        if str(error) != "missing":
            logger.warning("PLaMo auto-unload failed: %s", error)
    finally:
        if idle_models.get(key) is model and model.task is task:
            idle_models.pop(key)


def arm_unload(key, model):
    if model.task is not None:
        model.task.cancel()
    deadline = model.finished_at + getattr(shared.opts, PREFIX + "idle_seconds")
    model.task = asyncio.create_task(unload_when_idle(key, model, deadline))


def stop_unload(key):
    model = idle_models.pop(key, None)
    if model is not None and model.task is not None:
        model.task.cancel()


def stop_all_unloads():
    # Forge invokes script-unload callbacks from its UI worker thread.
    for key, model in list(idle_models.items()):
        loop = model.task.get_loop()
        if not loop.is_closed():
            loop.call_soon_threadsafe(stop_unload, key)


def idle_settings(request):
    enabled = request.get("auto_unload", getattr(shared.opts, PREFIX + "auto_unload"))
    seconds = request.get("idle_seconds", getattr(shared.opts, PREFIX + "idle_seconds"))
    if type(enabled) is not bool:
        raise backend.TranslationError("request")
    if type(seconds) is not int or not 1 <= seconds <= 2**53 - 1:
        raise backend.TranslationError("idleValue")
    return {"auto_unload": enabled, "idle_seconds": seconds}


async def translate(config, token, source, target):
    key = None

    def on_use(instance_id):
        nonlocal key
        key = (config["url"], instance_id)
        stop_unload(key)

    result = await backend.translate(config, token, source, target, on_use)
    if key is not None and getattr(shared.opts, PREFIX + "auto_unload"):
        model = IdleModel({**config, "timeout": min(config["timeout"], 10)}, token, time.monotonic())
        idle_models[key] = model
        arm_unload(key, model)
    return result


async def handle(request):
    if not isinstance(request, dict):
        return {"status": "request"}
    action = request.get("action")
    if action == "defaults":
        return {"status": "defaults", "config": {key: getattr(shared.opts, PREFIX + key) for key in DEFAULTS}}
    if action in ("check", "status"):
        try:
            config = backend.settings(request)
            models = await backend.inspect_models(config, request.get("token", ""))
            model_state = models.get(config["model"], "modelNotFound")
            if action == "status":
                return {"status": model_state}
            return {"status": "connected", "models": models}
        except backend.TranslationError as error:
            return {"status": str(error)}
    if active.locked():
        return {"status": "busy"}
    async with active:
        try:
            config = backend.settings(request)
            token = request.get("token", "")
            if action == "save":
                config.update(idle_settings(request))
                save_defaults(config)
                for key, model in list(idle_models.items()):
                    if config["auto_unload"]:
                        arm_unload(key, model)
                    else:
                        stop_unload(key)
                return {"status": "saved", "config": config}
            if action == "translate":
                return await translate(config, token, request.get("source"), request.get("target"))
            if action == "prepare":
                async with asyncio.timeout(config["timeout"]):
                    await backend.prepare_model(config, token)
                return {"status": "ready"}
            if action == "unload":
                async with asyncio.timeout(config["timeout"]):
                    model, instance = backend.find_model(await backend.list_models(config, token), config["model"])
                    if model is None:
                        return {"status": "modelNotFound"}
                    if instance is None:
                        return {"status": "alreadyUnloaded"}
                    instance_id = instance["id"]
                    reply = await backend.unload(config, token, instance_id)
                    if reply.get("instance_id") != instance_id:
                        return {"status": "unloadFailed"}
                    stop_unload((config["url"], instance_id))
                    return {"status": "unloadedNow"}
            return {"status": "request"}
        except backend.TranslationError as error:
            return {"status": str(error)}
        except TimeoutError:
            return {"status": "deadline"}


PANEL = """
<details class="plamo-panel" open>
  <summary><span class="plamo-summary"><span data-text="heading">PLaMo Translator</span><span class="plamo-model-state" data-field="model-state" role="status"></span><span class="plamo-status plamo-summary-status" data-field="status" role="status"></span></span></summary>
  <div class="plamo-body">
    <div class="plamo-toolbar">
      <div class="plamo-controls">
        <button type="button" data-field="direction" value="en">Japanese → English</button>
        <button type="button" data-action="translate" class="plamo-primary">Translate</button>
        <button type="button" data-action="append" class="plamo-send" data-text="send" disabled>Send</button>
      </div>
      <div class="plamo-controls plamo-output-controls">
        <button type="button" data-action="copy" data-text="copy" disabled>Copy</button>
        <button type="button" data-action="undo" data-text="undo" disabled>Undo</button>
        <fieldset class="plamo-mode" aria-label="Send mode" data-label="mode">
          <label data-tooltip="addHint"><input type="radio" name="plamo-mode-{tab}" value="add" checked><span data-text="add">Add</span></label>
          <label data-tooltip="replaceHint"><input type="radio" name="plamo-mode-{tab}" value="replace"><span data-text="replace">Rep</span></label>
        </fieldset>
        <button type="button" data-action="import" data-text="import" data-tooltip="importHint">Import Positive</button>
      </div>
    </div>
    <div class="plamo-editors">
      <textarea data-field="source" data-label="source" data-placeholder="source" aria-label="Source" placeholder="Source" rows="2"></textarea>
      <textarea data-field="result" data-label="translation" data-placeholder="translation" aria-label="Translation" placeholder="Translation" rows="2" spellcheck="false"></textarea>
    </div>
    <label class="plamo-restore" data-field="restore-box" hidden><span data-text="previous">Previous Positive prompt</span><textarea data-field="restore" rows="2" readonly></textarea></label>
  </div>
</details>
<button type="button" data-action="settings" class="plamo-settings-toggle" data-label="settings" data-tooltip="settings" aria-label="Settings" aria-haspopup="dialog"><span aria-hidden="true">⚙</span></button>
<dialog class="plamo-settings" aria-label="LM Studio Settings" data-label="settingsTitle">
  <div class="plamo-settings-head">
    <strong data-text="settingsTitle">LM Studio Settings</strong>
    <button type="button" data-action="close-settings" data-label="close" data-tooltip="close" aria-label="Close"><span aria-hidden="true">×</span></button>
  </div>
  <div class="plamo-settings-fields">
    <label class="plamo-full"><span data-text="urlLabel">Server URL</span><input data-field="url" type="url" placeholder="http://127.0.0.1:1234" spellcheck="false"></label>
    <label class="plamo-full"><span data-text="modelLabel">Model ID</span><input data-field="model" type="text" spellcheck="false" autocomplete="off"></label>
    <label class="plamo-full" data-field="model-picker" hidden><span data-text="models">Available models</span><select data-field="models"></select></label>
    <label><span data-text="timeoutLabel">Timeout (seconds)</span><input data-field="timeout" type="number" min="1" max="600" step="1"></label>
    <label><span data-text="token">API token (optional)</span><input data-field="token" type="password" autocomplete="off"></label>
    <label class="plamo-auto-unload"><input data-field="auto_unload" type="checkbox"><span data-text="autoUnload">Auto-unload</span></label>
    <label><span data-text="idleSeconds">Idle time (seconds)</span><input data-field="idle_seconds" type="number" min="1" step="1" disabled></label>
  </div>
  <div class="plamo-settings-actions">
    <button type="button" data-action="unload" data-text="unloadNow" data-tooltip="unloadHint">Unload Now</button>
    <button type="button" data-action="check" data-text="check">Test Connection</button>
    <button type="button" data-action="save" class="plamo-primary" data-text="saveLabel">Save</button>
  </div>
  <div class="plamo-status" data-field="settings-status" role="status"></div>
</dialog>
"""


def insert_panel(component, **kwargs):
    if not isinstance(component, gr.Row):
        return
    elem_id = kwargs.get("elem_id")
    tab = next((tab for tab in TABS if elem_id == f"{tab}_neg_prompt_row"), None)
    if tab is None:
        return
    context = get_blocks_context()
    if context is None:
        return
    # Context belongs to this Gradio build. A new Forge UI starts a new context.
    tabs = builds.setdefault(context, set())
    if tab in tabs:
        return
    if tab == "txt2img":
        send = gr.Button(visible=False)
        payload = gr.JSON(visible=False)
        reply = gr.JSON(visible=False)
        send.click(handle, inputs=payload, outputs=reply, queue=False, api_name="plamo_translate",
                   show_api=False, show_progress="hidden")
    gr.HTML(PANEL.format(tab=tab), elem_id=f"plamo_{tab}", elem_classes=["plamo-translator"])
    tabs.add(tab)


script_callbacks.on_ui_settings(register_settings)
script_callbacks.on_before_component(insert_panel)
script_callbacks.on_script_unloaded(stop_all_unloads)

