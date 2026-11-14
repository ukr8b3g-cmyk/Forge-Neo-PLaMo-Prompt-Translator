"""Local HTTP transport for the PLaMo prompt translator."""

import asyncio
import ipaddress
import json
import re
from urllib.parse import urlsplit

import httpx

DEFAULT_URL = "http://127.0.0.1:1234"
DEFAULT_MODEL = "plamo-3-translate-0.8b"
DEFAULT_TIMEOUT = 60
STOP = ["<|plamo:tag|>", "<|plamo:bos|>"]
CONTROL_TOKEN = re.compile(r"<\|plamo:[^>]*\|>", re.IGNORECASE)
PROMPT_SYNTAX = re.compile(r"<[^<>\n]+:[^<>\n]+>|[()[\]\\]|\b(?:AND|BREAK)\b|__[^_\n].*?__|:\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)[ \t]*$", re.MULTILINE)


class TranslationError(Exception):
    pass


def settings(payload):
    url = payload.get("url")
    model = payload.get("model")
    timeout = payload.get("timeout")
    if not isinstance(url, str) or len(url) > 200:
        raise TranslationError("url")
    try:
        parts = urlsplit(url.strip())
        host = parts.hostname
        port = parts.port
        address = "127.0.0.1" if host == "localhost" else str(ipaddress.IPv4Address(host))
        if (
            parts.scheme != "http" or not ipaddress.IPv4Address(address).is_loopback
            or parts.username is not None or parts.password is not None
            or parts.path.rstrip("/") not in ("", "/v1")
            or parts.query or parts.fragment or not port
        ):
            raise ValueError
    except (TypeError, ValueError):
        raise TranslationError("url") from None
    if not isinstance(model, str) or len(model) > 200 or any(ord(c) < 32 for c in model):
        raise TranslationError("model")
    if type(timeout) is not int or not 1 <= timeout <= 600:
        raise TranslationError("timeout_value")
    return {"url": f"http://{address}:{port}", "model": model.strip(), "timeout": timeout}


async def request(config, token, path, payload=None):
    if not isinstance(token, str) or len(token) > 4096 or any(not 33 <= ord(c) <= 126 for c in token):
        raise TranslationError("auth")
    headers = {"Accept-Encoding": "identity"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    timeout = config["timeout"]
    try:
        async with asyncio.timeout(timeout):
            async with httpx.AsyncClient(
                trust_env=False, follow_redirects=False,
                timeout=httpx.Timeout(timeout, connect=min(3, timeout)),
            ) as client:
                async with client.stream(
                    "GET" if payload is None else "POST",
                    config["url"] + path, headers=headers, json=payload,
                ) as reply:
                    if reply.status_code in (401, 403):
                        raise TranslationError("auth")
                    if reply.status_code == 404:
                        raise TranslationError("missing")
                    if not reply.is_success:
                        raise TranslationError("server")
                    content = bytearray()
                    async for chunk in reply.aiter_bytes(chunk_size=65536):
                        content.extend(chunk)
                        if len(content) > 1024 * 1024:
                            raise TranslationError("response")
    except (TimeoutError, httpx.TimeoutException):
        raise TranslationError("deadline") from None
    except httpx.HTTPError:
        raise TranslationError("connection") from None

    try:
        data = json.loads(content)
    except (ValueError, RecursionError):
        raise TranslationError("response") from None
    if not isinstance(data, dict):
        raise TranslationError("response")
    return data


async def list_models(config, token):
    data = await request(config, token, "/api/v1/models")
    models = data.get("models")
    if not isinstance(models, list):
        raise TranslationError("response")
    return [
        model for model in models
        if isinstance(model, dict) and model.get("type") == "llm"
        and isinstance(model.get("key"), str) and 0 < len(model["key"]) <= 200
    ]


def instances(model):
    loaded = model.get("loaded_instances")
    if not isinstance(loaded, list):
        return []
    return [
        item for item in loaded if isinstance(item, dict)
        and isinstance(item.get("id"), str) and item["id"]
    ]


def context_size(value):
    return value.get("context_length") if isinstance(value, dict) else None


def find_model(models, selected):
    exact = next((model for model in models if model["key"] == selected), None)
    if exact is not None:
        loaded = instances(exact)
        instance = next((item for item in loaded if item["id"] == selected), None)
        return exact, instance or next(iter(loaded), None)
    for model in models:
        for instance in instances(model):
            if instance["id"] == selected:
                return model, instance
    return None, None


async def inspect_models(config, token):
    models = await list_models(config, token)
    available = {}
    for model in models:
        loaded = instances(model)
        available[model["key"]] = "ready" if loaded else "notLoaded"
        for instance in loaded:
            available[instance["id"]] = "ready"
    return available


async def prepare_model(config, token):
    selected = config["model"]
    model, instance = find_model(await list_models(config, token), selected)
    if model is None:
        raise TranslationError("modelNotFound")
    if instance is not None:
        return instance["id"], context_size(instance.get("config"))

    payload = {"model": model["key"], "echo_load_config": True}
    try:
        loaded = await request(config, token, "/api/v1/models/load", payload)
    except TranslationError as error:
        if str(error) == "missing":
            raise TranslationError("loadFailed") from None
        if str(error) != "server":
            raise
        # An unload can still be settling when the same model is requested.
        # Check whether a load already completed before retrying the POST.
        await asyncio.sleep(0.6)
        _, instance = find_model(await list_models(config, token), selected)
        if instance is not None:
            return instance["id"], context_size(instance.get("config"))
        try:
            loaded = await request(config, token, "/api/v1/models/load", payload)
        except TranslationError as retry_error:
            if str(retry_error) in ("missing", "server"):
                raise TranslationError("loadFailed") from None
            raise

    instance_id = loaded.get("instance_id")
    if loaded.get("status") != "loaded" or not isinstance(instance_id, str) or not instance_id:
        raise TranslationError("loadFailed")
    return instance_id, context_size(loaded.get("load_config"))


async def translate(config, token, source, target, on_use=None):
    if target not in ("en", "ja") or not isinstance(source, str) or not source.strip():
        raise TranslationError("input")
    if len(source) > 2000 or len(source.encode("utf-8", errors="replace")) > 8000:
        raise TranslationError("size")
    if CONTROL_TOKEN.search(source) or PROMPT_SYNTAX.search(source):
        raise TranslationError("syntax")
    if not config["model"]:
        raise TranslationError("model")

    async with asyncio.timeout(config["timeout"]):
        instance_id, context_length = await prepare_model(config, token)
        # The UTF-8 byte count is a conservative preflight estimate for the
        # byte-fallback tokenizer. Leave room for the template and output.
        if type(context_length) is int and len(source.encode("utf-8", errors="replace")) + 640 > context_length:
            raise TranslationError("context")
        if on_use is not None:
            on_use(instance_id)
        response = await request(config, token, "/v1/chat/completions", {
            "model": instance_id,
            "messages": [
                {"role": "system", "content": f"[plamo-translate]\ntarget_lang={target}"},
                {"role": "user", "content": source},
            ],
            "temperature": 0, "max_tokens": 512, "stop": STOP, "stream": False,
        })

    choices = response.get("choices")
    if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
        raise TranslationError("response")
    choice = choices[0]
    message = choice.get("message")
    reason = choice.get("finish_reason")
    text = message.get("content") if isinstance(message, dict) else None
    if (
        reason not in ("stop", "length") or not isinstance(text, str) or not text.strip()
        or CONTROL_TOKEN.search(text) or message.get("tool_calls") or message.get("function_call")
    ):
        raise TranslationError("response")
    return {"status": "translated" if reason == "stop" else "partial", "text": text}


async def unload(config, token, instance_id):
    return await request(config, token, "/api/v1/models/unload", {"instance_id": instance_id})

