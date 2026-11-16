(() => {
    "use strict";

    const tabs = ["txt2img", "img2img"];
    const mounted = new WeakSet();
    const panels = new Map();
    const promptSyntax = [
        /<\|plamo:[^>]*\|>/i,
        /<[\p{L}\p{N}_]+:[^<>\r\n]+>/u,
        /\((?:[^()\r\n]|\([^()\r\n]*\))*:[ \t]*[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)[ \t]*\)/,
        /\[[^\[\]\r\n]*:[ \t]*[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[ \t]*\]/,
        /\[[^\[\]\r\n]*\|[^\[\]\r\n]*\]/,
        /(?<![\p{L}\p{N}_])(?:AND|BREAK)(?![\p{L}\p{N}_])/u,
        /__[^_\n].*?__/,
    ];
    const hasPromptSyntax = (text) => promptSyntax.some(pattern => pattern.test(text));
    const strings = {
        heading: ["PLaMo Translator","PLaMo 翻訳"],
        direction: ["Translation direction","翻訳方向"],
        languageSettings: ["Languages","言語選択"],
        sourceLanguage: ["Source language","原文の言語"],
        targetLanguage: ["Translate to","翻訳先"],
        auto: ["Auto","自動"],
        swapHint: ["Swap source and target languages","原文と翻訳先の言語を入れ替える"],
        simplifiedChinese: ["Chinese (Simplified)","中国語（簡体字）"],
        traditionalChinese: ["Chinese (Traditional)","中国語（繁体字）"],
        import: ["Import Positive","Positive 取込"],
        importHint: ["Copy the current Positive prompt into the source field","現在の Positive を原文欄に取り込む"],
        translate: ["Translate","翻訳"],
        cancel: ["Cancel","中止"],
        copy: ["Copy","コピー"],
        mode: ["Send mode","反映方法"],
        add: ["Add","追記"],
        replace: ["Rep","置換"],
        addHint: ["Append the translation to Positive","訳文を Positive の末尾に追記"],
        replaceHint: ["Replace Positive with the translation","Positive を訳文で置き換える"],
        send: ["Send","反映"],
        undo: ["Undo","元に戻す"],
        source: ["Source","原文"],
        translation: ["Translation","訳文"],
        previous: ["Previous Positive prompt","変更前の Positive"],
        settings: ["Settings","設定"],
        settingsTitle: ["LM Studio Settings","LM Studio 設定"],
        close: ["Close","閉じる"],
        urlLabel: ["Server URL","接続先 URL"],
        modelLabel: ["Model ID","モデル ID"],
        models: ["Available models","接続先のモデル"],
        timeoutLabel: ["Total timeout (seconds)","全体タイムアウト（秒）"],
        maxTokens: ["Maximum output tokens","最大出力トークン数／1回"],
        tokensHint: ["Per segment. The combined translation can exceed this limit.","分割した各区間の上限です。結合後の訳文はこの上限を超えられます。"],
        tokens_value: ["Choose 256, 512, 1024 or 2048 output tokens.","最大出力トークン数は256・512・1024・2048から選んでください。"],
        language: ["Choose supported source and target languages.","対応する原文の言語と翻訳先を選んでください。"],
        output_size: ["The combined translation is too large. Shorten the source.","結合後の訳文が長すぎます。原文を短くしてください。"],
        token: ["API token (optional)","API トークン（任意）"],
        autoUnload: ["Auto-unload","自動アンロード"],
        unloadNow: ["Unload Now","今すぐアンロード"],
        unloadHint: ["Unload the model used by Translate","翻訳に使うモデルをアンロード"],
        unloadSaveFirst: ["Save the connection settings to unload the model.","アンロードするには接続設定を保存してください。"],
        unloading: ["Unloading model…","モデルをアンロード中…"],
        unloadedNow: ["Model unloaded.","モデルをアンロードしました。"],
        alreadyUnloaded: ["Model is already unloaded.","モデルはすでに未ロードです。"],
        unloadFailed: ["Could not verify the model was unloaded.","モデルをアンロードできたか確認できませんでした。"],
        idleSeconds: ["Idle time (seconds)","待ち時間（秒）"],
        idleValue: ["Enter a positive whole number of seconds.","待ち時間は1秒以上の整数で入力してください。"],
        check: ["Test Connection","接続確認"],
        checkHint: ["Test the server and load the selected model if needed","接続を確認し、選択中のモデルが未ロードなら読み込む"],
        saveLabel: ["Save","保存"],
        choose: ["Select a model","モデルを選択"],
        auth: ["Authentication failed. Check the API token.","認証できません。API トークンを確認してください。"],
        busy: ["Another request is running. Try again when it finishes.","先に開始した処理が終わってから、もう一度お試しください。"],
        connection: ["Could not connect to LM Studio. Check its server and URL.","LM Studio に接続できません。起動状態と接続先を確認してください。"],
        context: ["The source exceeds the model's context. Shorten it and try again.","原文がモデルのコンテキストに収まりません。原文を短くしてください。"],
        deadline: ["Timed out. Gear → Total timeout.","時間切れ。歯車 → 全体タイムアウトを確認。"],
        input: ["Enter text to translate.","原文を入力してください。"],
        missing: ["The LM Studio API or model could not be found.","LM Studio の API またはモデルが見つかりません。"],
        model: ["Check the LM Studio model ID.","LM Studio のモデル ID を確認してください。"],
        request: ["The translation panel could not complete the request.","翻訳パネルの通信に失敗しました。"],
        response: ["LM Studio did not return a valid translation.","LM Studio から有効な訳文が返りませんでした。"],
        save: ["Could not save the Forge settings.","Forge の設定を保存できませんでした。"],
        server: ["LM Studio could not complete the request. Check its Developer tab.","LM Studio で処理できませんでした。Developer 画面を確認してください。"],
        size: ["Keep the source within 16,000 characters / 64 KiB.","原文は16,000文字・64 KiB以内にしてください。"],
        syntax: ["Remove LoRA tags, explicit weights, or other prompt controls from the source.","LoRAタグ、数値付きの重み指定などのプロンプト制御構文を原文から除いてください。"],
        timeout_value: ["Use a whole number from 1 to 600 seconds.","タイムアウトは 1～600 秒の整数で指定してください。"],
        modelNotFound: ["Model not found","モデルが見つかりません"],
        loadFailed: ["LM Studio could not load the selected model. Check its Developer tab.","LM Studio でモデルを読み込めませんでした。Developer 画面を確認してください。"],
        modelUnknown: ["Checking model…","モデル確認中…"],
        notLoaded: ["Not loaded","未ロード"],
        loadingModel: ["Loading model…","モデルをロード中…"],
        ready: ["Ready","翻訳可能"],
        modelOffline: ["LM Studio unavailable","LM Studio に接続できません"],
        modelAuth: ["Check API token","API トークンを確認"],
        modelStatusError: ["Model status unavailable","モデル状態を確認できません"],
        url: ["Enter a local URL such as http://127.0.0.1:1234.","接続先に http://127.0.0.1:1234 形式のアドレスを入力してください。"],
        stale: ["Previous translation. Translate again to send it.","前回の訳文です。反映するには翻訳し直してください。"],
        invalidResult: ["Remove prompt syntax from the translation before sending.","訳文のプロンプト構文を直すと反映できます。"],
        edited: ["Translation edited.","訳文を編集しました。"],
        checking: ["Testing connection…","接続を確認しています…"],
        settingsChanged: ["Settings changed. Test the connection again.","設定が変わりました。もう一度接続を確認してください。"],
        connected: ["Connected to LM Studio.","接続を確認しました。"],
        emptyModels: ["Connected. No models listed.","接続できました。モデル一覧は空です。"],
        saved: ["Settings saved.","設定を保存しました。"],
        cancelled: ["Cancelled. You can translate again when the request ends.","中止しました。通信終了後に再度翻訳できます。"],
        translating: ["Translating…","翻訳中…"],
        translatingLong: ["Translating in segments…","長文を分割して翻訳中…"],
        discarded: ["The source or direction changed. Translate again.","原文か翻訳方向が変わりました。翻訳し直してください。"],
        partial: ["Output cut off. Gear → Maximum output tokens.","訳文が途中。歯車 → 最大出力トークン数"],
        translated: ["Translation ready.","翻訳しました。"],
        oldResult: ["The previous translation is still shown.","前回の訳文を表示しています。"],
        copied: ["Translation copied.","訳文をコピーしました。"],
        copyManually: ["Copy the selected translation manually.","選択した訳文を手動でコピーしてください。"],
        noPositive: ["Could not find the Positive prompt for this tab.","このタブの Positive に接続できません。"],
        alreadySent: ["This translation was already sent.","この訳文は反映済みです。"],
        added: ["Added to Positive.","Positive に追記しました。"],
        replaced: ["Positive replaced.","Positive を置き換えました。"],
        undoConflict: ["Positive has been edited. The previous text is available to copy.","Positive は編集済みです。必要なら変更前の本文をコピーしてください。"],
        undone: ["Previous Positive restored.","変更前の Positive に戻しました。"],
    };
    const japanese = () => /^(?:ja(?:$|[-_ (])|japanese(?:$|[-_ (])|日本語)/i.test(String(opts.localization || "").trim());
    const t = (key) => strings[key][japanese() ? 1 : 0];
    const errorText = (status) => t(Object.hasOwn(strings, status) ? status : "request");
    const statusTones = {
        connected: "success",
        ready: "success",
        unloadedNow: "success",
        checking: "progress",
        modelUnknown: "progress",
        loadingModel: "progress",
        unloading: "progress",
        notLoaded: "warning",
        alreadyUnloaded: "warning",
        emptyModels: "warning",
        settingsChanged: "warning",
        busy: "warning",
    };

    let config;
    let pending = false;
    let modelState = "modelUnknown";
    let modelCheck = 0;

    function setModelState(state) {
        modelState = state;
        for (const panel of panels.values()) panel.renderModelState();
    }

    function displayState(state) {
        if (["ready", "notLoaded", "modelNotFound"].includes(state)) return state;
        if (state === "connection") return "modelOffline";
        if (state === "auth") return "modelAuth";
        return "modelStatusError";
    }

    async function refreshModel() {
        if (!config?.model) {
            setModelState("modelNotFound");
            return;
        }
        const check = ++modelCheck;
        try {
            const reply = await send("status", {...config, timeout: Math.min(config.timeout, 5)});
            if (check === modelCheck) setModelState(displayState(reply.status));
        } catch {
            if (check === modelCheck) setModelState("modelStatusError");
        }
    }

    function readDefaults() {
        return {
            url: opts.plamo_translator_url ?? "http://127.0.0.1:1234",
            model: opts.plamo_translator_model ?? "plamo-3-translate-0.8b",
            timeout: opts.plamo_translator_timeout ?? 60,
            max_tokens: opts.plamo_translator_max_tokens ?? 512,
            auto_unload: opts.plamo_translator_auto_unload ?? false,
            idle_seconds: opts.plamo_translator_idle_seconds ?? 300,
            token: "",
        };
    }

    async function send(action, data) {
        // Gradio's root includes a deployment prefix when present. Keep
        // browser traffic on the Forge origin, including on another port.
        const root = new URL(window.gradio_config?.root || ".", window.location.href);
        const path = root.pathname.replace(/\/$/, "") + "/run/plamo_translate";
        const response = await fetch(path, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({data: [{...data, action}]}),
        });
        if (!response.ok) throw new Error("Forge request failed");
        return (await response.json()).data[0];
    }

    function busy(value) {
        pending = value;
        for (const panel of panels.values()) panel.render();
    }

    function syncEditorHeights(source, result) {
        let sharedHeight;
        let frame;
        const observer = new ResizeObserver(() => {
            if (frame !== undefined) return;
            frame = requestAnimationFrame(() => {
                frame = undefined;
                if (!source.isConnected || !result.isConnected) {
                    observer.disconnect();
                    return;
                }
                if (!source.offsetHeight || !result.offsetHeight) return;

                const sourceHeight = getComputedStyle(source).height;
                const resultHeight = getComputedStyle(result).height;
                if (sourceHeight === resultHeight) {
                    sharedHeight = sourceHeight;
                    return;
                }
                if (sourceHeight === sharedHeight) {
                    source.style.height = sharedHeight = resultHeight;
                } else {
                    result.style.height = sharedHeight = sourceHeight;
                }
            });
        });
        observer.observe(source);
        observer.observe(result);
    }

    function panelFor(root, tab) {
        const field = (name) => root.querySelector('[data-field="' + name + '"]');
        const button = (name) => root.querySelector('[data-action="' + name + '"]');
        const source = field("source");
        const result = field("result");
        syncEditorHeights(source, result);
        const direction = field("direction");
        const status = field("status");
        const modelIndicator = field("model-state");
        const settings = root.querySelector(".plamo-settings:not(.plamo-languages)");
        const languageMenu = root.querySelector(".plamo-languages");
        const sourceLanguage = field("source-language");
        const targetLanguage = field("target-language");
        const languageKey = "plamo-translator:languages:" + tab;
        try {
            const saved = JSON.parse(localStorage.getItem(languageKey));
            if (saved && [...sourceLanguage.options].some(o => o.value === saved.source)
                    && [...targetLanguage.options].some(o => o.value === saved.target)) {
                sourceLanguage.value = saved.source;
                targetLanguage.value = saved.target;
            }
        } catch { /* Language selection still works without browser storage. */ }
        const settingsStatus = field("settings-status");
        const unloadHint = field("unload-hint");
        const modelPicker = field("model-picker");
        const modelList = field("models");
        const modelFields = ["url", "model", "token"];
        const restore = field("restore-box");
        const positive = () => gradioApp().querySelector("#" + tab + "_prompt textarea");

        let revision = 0;
        let accepted = -1;
        let resultRevision = 0;
        let request = null;
        let lastAppend = null;
        let checkedModels = null;

        function renderModelState() {
            const label = t(modelState);
            modelIndicator.dataset.state = modelState;
            modelIndicator.dataset.tone = statusTones[modelState] ?? "error";
            if (modelIndicator.textContent !== label) modelIndicator.textContent = label;
        }

        function showSettingsStatus(...statuses) {
            const parts = [];
            for (const key of statuses) {
                const part = document.createElement("span");
                part.dataset.tone = statusTones[key] ?? "error";
                part.textContent = errorText(key);
                if (parts.length) parts.push(" ");
                parts.push(part);
            }
            settingsStatus.replaceChildren(...parts);
        }

        function localize() {
            root.lang = japanese() ? "ja" : "en";
            for (const element of root.querySelectorAll("[data-text], [data-label], [data-tooltip], [data-placeholder]")) {
                const {text, label, tooltip, placeholder} = element.dataset;
                if (text && element.textContent !== t(text)) element.textContent = t(text);
                if (label) element.setAttribute("aria-label", t(label));
                if (tooltip) element.title = t(tooltip);
                if (placeholder) element.placeholder = t(placeholder);
            }
            if (modelList.options.length && modelList.options[0].textContent !== t("choose")) {
                modelList.options[0].textContent = t("choose");
            }
            const names = new Intl.DisplayNames([japanese() ? "ja" : "en"], {type: "language"});
            const languageLabel = code => ({auto: t("auto"), "zh-hans": t("simplifiedChinese"),
                "zh-hant": t("traditionalChinese")}[code] ?? names.of(code));
            for (const select of [sourceLanguage, targetLanguage]) {
                const selected = select.value;
                const priority = ["auto", "en", "zh-hans", "zh-hant", "ja"];
                const options = [...select.options];
                for (const option of options) option.textContent = languageLabel(option.value);
                options.sort((a, b) => {
                    const rank = code => priority.includes(code) ? priority.indexOf(code) : priority.length;
                    return rank(a.value) - rank(b.value) || a.textContent.localeCompare(b.textContent, root.lang);
                });
                select.replaceChildren(...options);
                select.value = selected;
            }
            renderDirection();
            button("check").title = t("checkHint");
            renderModelState();
            render();
        }

        function renderDirection() {
            direction.value = targetLanguage.value;
            const label = `${sourceLanguage.selectedOptions[0].textContent} → ${targetLanguage.selectedOptions[0].textContent}`;
            // Codes keep both sides visible even for long names such as Chinese variants.
            const compact = code => code === "auto" ? t("auto") : code.replace(/^([a-z]+)(.*)$/, (_, lang, script) => lang.toUpperCase() + script);
            direction.textContent = `${compact(sourceLanguage.value)} → ${compact(targetLanguage.value)}`;
            direction.setAttribute("aria-label", t("direction") + " — " + label);
            direction.title = label + " — " + t(sourceLanguage.value === "auto" ? "languageSettings" : "swapHint");
        }

        function languagesChanged() {
            try {
                localStorage.setItem(languageKey, JSON.stringify({source: sourceLanguage.value, target: targetLanguage.value}));
            } catch { /* Private browsing may disable storage. */ }
            renderDirection();
            invalidate();
        }

        function render() {
            const valid = accepted === revision;
            result.readOnly = Boolean(request);
            const label = t(request ? "cancel" : "translate");
            if (button("translate").textContent !== label) button("translate").textContent = label;
            button("translate").disabled = !request && (pending || !source.value.trim());
            button("copy").disabled = !result.value.trim();
            button("append").disabled = !valid || Boolean(request) || !result.value.trim() || hasPromptSyntax(result.value);
            button("check").disabled = pending;
            const needsSave = unloadTargetChanged();
            button("unload").disabled = pending || !config.model || needsSave;
            unloadHint.hidden = !needsSave;
            button("save").disabled = pending;
            button("undo").disabled = !lastAppend;
        }

        function invalidate() {
            revision += 1;
            if (result.value && !request) status.textContent = t("stale");
            render();
        }

        function fillSettings() {
            for (const key of ["url", "model", "timeout", "max_tokens", "token", "idle_seconds"]) field(key).value = config[key];
            field("auto_unload").checked = config.auto_unload;
            field("idle_seconds").disabled = !config.auto_unload;
            checkedModels = null;
            modelPicker.hidden = true;
        }

        function draft() {
            return {
                url: field("url").value,
                model: field("model").value,
                timeout: field("timeout").valueAsNumber,
                max_tokens: Number(field("max_tokens").value),
                token: field("token").value,
            };
        }

        function unloadTargetChanged() {
            return modelFields.some(key => field(key).value !== config[key]);
        }

        field("auto_unload").addEventListener("change", () => {
            field("idle_seconds").disabled = !field("auto_unload").checked;
        });

        function setPositive(target, value) {
            target.value = value;
            updateInput(target);
        }

        source.addEventListener("input", invalidate);
        direction.addEventListener("click", () => {
            if (sourceLanguage.value === "auto") {
                openDialog(languageMenu, button("languages"));
                return;
            }
            const previous = sourceLanguage.value;
            sourceLanguage.value = targetLanguage.value;
            targetLanguage.value = previous;
            languagesChanged();
        });
        sourceLanguage.addEventListener("change", languagesChanged);
        targetLanguage.addEventListener("change", languagesChanged);
        result.addEventListener("input", () => {
            resultRevision += 1;
            if (accepted === revision) {
                status.textContent = hasPromptSyntax(result.value)
                    ? t("invalidResult")
                    : t("edited");
            }
            render();
        });

        button("import").addEventListener("click", () => {
            const target = positive();
            if (!target) return;
            source.value = target.value;
            invalidate();
            source.focus();
        });

        const gear = button("settings");
        const viewport = window.visualViewport;
        function positionDialog(dialog, trigger) {
            if (!dialog.open) return;
            const margin = 12;
            const gap = 6;
            const left = (viewport?.offsetLeft ?? 0) + margin;
            const top = (viewport?.offsetTop ?? 0) + margin;
            const right = left + (viewport?.width ?? document.documentElement.clientWidth) - 2 * margin;
            const bottom = top + (viewport?.height ?? document.documentElement.clientHeight) - 2 * margin;
            const anchor = trigger.getBoundingClientRect();
            const below = Math.max(top, Math.min(anchor.bottom + gap, bottom));
            const above = Math.max(top, Math.min(anchor.top - gap, bottom));
            dialog.style.setProperty("--plamo-settings-width", `${right - left}px`);
            const needed = dialog.scrollHeight + dialog.offsetHeight - dialog.clientHeight;
            const openBelow = needed <= bottom - below || bottom - below >= above - top;
            const available = openBelow ? bottom - below : above - top;
            dialog.style.setProperty("--plamo-settings-height", `${available}px`);
            dialog.style.setProperty("--plamo-settings-top", `${openBelow ? below : above - dialog.offsetHeight}px`);
            dialog.style.setProperty("--plamo-settings-left",
                `${Math.max(left, Math.min(anchor.right - dialog.offsetWidth, right - dialog.offsetWidth))}px`);
        }

        function openDialog(dialog, trigger) {
            dialog.showModal();
            const position = () => positionDialog(dialog, trigger);
            position();
            const listeners = new AbortController();
            const {signal} = listeners;
            const resize = new ResizeObserver(position);
            window.addEventListener("resize", position, {signal});
            window.addEventListener("scroll", position, {signal, capture: true, passive: true});
            viewport?.addEventListener("resize", position, {signal});
            viewport?.addEventListener("scroll", position, {signal});
            resize.observe(dialog);
            dialog.addEventListener("close", () => {
                listeners.abort();
                resize.disconnect();
            }, {once: true});
            dialog.addEventListener("click", event => {
                if (event.target !== dialog) return;
                const rect = dialog.getBoundingClientRect();
                if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
            }, {signal});
        }
        gear.addEventListener("click", () => {
            showSettingsStatus();
            openDialog(settings, gear);
        });
        button("close-settings").addEventListener("click", () => settings.close());
        button("languages").addEventListener("click", () => openDialog(languageMenu, button("languages")));
        button("close-languages").addEventListener("click", () => languageMenu.close());

        function showCheckedModel() {
            if (!checkedModels) return;
            const selected = field("model").value.trim();
            modelList.value = Object.hasOwn(checkedModels, selected) ? selected : "";
            const state = modelList.value ? checkedModels[selected] : "modelNotFound";
            showSettingsStatus("connected", state);
        }

        modelList.addEventListener("change", () => {
            if (modelList.value) field("model").value = modelList.value;
            showCheckedModel();
            render();
        });
        field("model").addEventListener("input", showCheckedModel);
        for (const key of ["url", "token"]) field(key).addEventListener("input", () => {
            checkedModels = null;
            modelPicker.hidden = true;
            showSettingsStatus();
        });
        for (const key of modelFields) {
            field(key).addEventListener("input", render);
            field(key).addEventListener("change", render);
        }

        button("check").addEventListener("click", async () => {
            if (pending) return;
            const values = draft();
            busy(true);
            checkedModels = null;
            showSettingsStatus("checking");
            const sameDraft = () => modelFields.every(key => field(key).value === values[key]);
            const currentModel = !unloadTargetChanged();
            try {
                const reply = await send("check", values);
                if (reply.status !== "connected") {
                    showSettingsStatus(reply.status);
                    return;
                }
                if (!sameDraft()) {
                    showSettingsStatus("settingsChanged");
                    return;
                }
                const models = reply.models;
                checkedModels = models;
                const options = Object.keys(models).sort().map((name) => new Option(name, name));
                modelList.replaceChildren(new Option(t("choose"), ""), ...options);
                modelPicker.hidden = !options.length;
                if (options.length) showCheckedModel();
                else showSettingsStatus("emptyModels");
                if (models[values.model.trim()] !== "notLoaded" || !settings.open) return;

                showSettingsStatus("connected", "loadingModel");
                if (currentModel) {
                    modelCheck += 1;
                    setModelState("loadingModel");
                }
                const prepared = await send("prepare", values);
                if (!sameDraft() || checkedModels !== models) {
                    showSettingsStatus("settingsChanged");
                    return;
                }
                if (prepared.status === "ready") {
                    models[values.model.trim()] = "ready";
                    showCheckedModel();
                } else {
                    showSettingsStatus("connected", prepared.status);
                }
            } catch {
                showSettingsStatus("request");
            } finally {
                busy(false);
                if (currentModel) void refreshModel();
            }
        });

        button("unload").addEventListener("click", async () => {
            if (pending || !config.model || unloadTargetChanged()) return;
            busy(true);
            showSettingsStatus("unloading");
            try {
                const reply = await send("unload", config);
                checkedModels = null;
                modelPicker.hidden = true;
                showSettingsStatus(reply.status);
            } catch {
                showSettingsStatus("request");
            } finally {
                void refreshModel();
                busy(false);
            }
        });

        button("save").addEventListener("click", async () => {
            if (pending) return;
            const values = draft();
            const autoUnload = field("auto_unload").checked;
            const idleSeconds = field("idle_seconds").valueAsNumber;
            const validIdleTime = Number.isSafeInteger(idleSeconds) && idleSeconds >= 1;
            if (autoUnload && !validIdleTime) {
                showSettingsStatus("idleValue");
                field("idle_seconds").focus();
                return;
            }
            busy(true);
            try {
                const reply = await send("save", {
                    ...values,
                    auto_unload: autoUnload,
                    idle_seconds: validIdleTime ? idleSeconds : config.idle_seconds,
                });
                if (reply.status !== "saved") {
                    showSettingsStatus(reply.status);
                    return;
                }
                const next = {...reply.config, token: values.token};
                const changed = ["url", "model", "timeout", "max_tokens", "token"].some((key) => next[key] !== config[key]);
                config = next;
                for (const panel of panels.values()) {
                    panel.fillSettings();
                    if (changed) panel.invalidate();
                }
                if (!changed || !result.value) status.textContent = t("saved");
                settings.close();
                if (changed) {
                    setModelState("modelUnknown");
                    void refreshModel();
                }
            } catch {
                showSettingsStatus("request");
            } finally {
                busy(false);
            }
        });

        button("translate").addEventListener("click", async () => {
            if (request) {
                request = null;
                status.textContent = t("cancelled");
                render();
                return;
            }
            if (pending || !source.value.trim()) return;
            const current = {revision};
            request = current;
            accepted = -1;
            status.textContent = t("modelUnknown");
            busy(true);
            try {
                await refreshModel();
                if (request !== current) return;
                if (current.revision !== revision) {
                    status.textContent = t("discarded");
                    return;
                }
                if (modelState === "notLoaded") setModelState("loadingModel");
                status.textContent = t(modelState === "loadingModel" ? "loadingModel" : (Array.from(source.value).length > 2000 ? "translatingLong" : "translating"));
                const reply = await send("translate", {...config, source: source.value, target: targetLanguage.value, source_lang: sourceLanguage.value});
                if (reply.status === "translated" || reply.status === "partial") setModelState("ready");
                if (request !== current) return;
                if (current.revision !== revision) {
                    status.textContent = t("discarded");
                    return;
                }
                if (reply.status === "translated" || reply.status === "partial") {
                    result.value = reply.text;
                    resultRevision += 1;
                    if (reply.status === "translated") accepted = revision;
                    status.textContent = reply.status === "partial"
                        ? t("partial")
                        : (hasPromptSyntax(reply.text) ? t("invalidResult") : t("translated"));
                } else {
                    status.textContent = errorText(reply.status) + (result.value ? " " + t("oldResult") : "");
                }
            } catch {
                if (request === current) status.textContent = t("request") + (result.value ? " " + t("oldResult") : "");
            } finally {
                if (request === current) request = null;
                busy(false);
                void refreshModel();
            }
        });

        button("copy").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(result.value);
                status.textContent = t("copied");
            } catch {
                result.focus();
                result.select();
                status.textContent = t("copyManually");
            }
        });

        button("append").addEventListener("click", () => {
            if (button("append").disabled) return;
            const target = positive();
            if (!target || typeof updateInput !== "function") {
                status.textContent = t("noPositive");
                return;
            }
            const before = target.value;
            const text = result.value;
            const mode = root.querySelector(".plamo-mode input:checked").value;
            if (lastAppend?.after === before && lastAppend.resultRevision === resultRevision && lastAppend.mode === mode) {
                status.textContent = t("alreadySent");
                return;
            }
            const separator = !before || before.endsWith("\n") || text.startsWith("\n") ? "" : "\n";
            const after = mode === "replace" ? text : before + separator + text;
            if (after === before) return;
            lastAppend = {before, after, resultRevision, mode};
            setPositive(target, after);
            restore.hidden = true;
            status.textContent = t(mode === "add" ? "added" : "replaced");
            render();
        });

        button("undo").addEventListener("click", () => {
            if (!lastAppend) return;
            const target = positive();
            if (!target || target.value !== lastAppend.after) {
                field("restore").value = lastAppend.before;
                restore.hidden = false;
                status.textContent = t("undoConflict");
                return;
            }
            setPositive(target, lastAppend.before);
            lastAppend = null;
            restore.hidden = true;
            status.textContent = t("undone");
            render();
        });

        root.addEventListener("keydown", (event) => {
            if (event.isComposing || event.keyCode === 229
                || event.key === "Escape"
                || (event.key === "Enter" && (event.ctrlKey || event.metaKey || event.altKey))) {
                event.stopPropagation();
            }
        });

        // The host reverses the two prompt rows when restoring Compact's
        // generation view. Observe that container only and reposition our panel.
        const container = gradioApp().getElementById(tab + "_prompt_container");
        const positiveRow = gradioApp().getElementById(tab + "_prompt_row");
        const negativeRow = gradioApp().getElementById(tab + "_neg_prompt_row");
        if (container?.classList.contains("prompt-container-compact") && positiveRow && negativeRow) {
            const place = () => {
                const home = positiveRow.parentElement === container && negativeRow.parentElement === container;
                root.hidden = !home;
                if (!home && settings.open) settings.close();
                if (!home && languageMenu.open) languageMenu.close();
                if (home && positiveRow.nextElementSibling !== root) positiveRow.after(root);
            };
            new MutationObserver(place).observe(container, {childList: true});
            place();
        }

        fillSettings();
        localize();
        return {render, invalidate, fillSettings, localize, renderModelState};
    }

    function rememberAccordion(accordion, tab) {
        const key = "plamo-translator:accordion:" + tab;
        try {
            const saved = localStorage.getItem(key);
            if (saved === "open" || saved === "closed") accordion.open = saved === "open";
        } catch {
            // The accordion still works when browser storage is unavailable.
            return;
        }

        let wasOpen = accordion.open;
        accordion.addEventListener("toggle", () => {
            if (accordion.open === wasOpen) return;
            wasOpen = accordion.open;
            try {
                localStorage.setItem(key, wasOpen ? "open" : "closed");
            } catch {
                // Keep the current state even if the browser cannot save it.
            }
        });
    }

    function mount() {
        for (const tab of tabs) {
            const root = gradioApp().getElementById("plamo_" + tab);
            const accordion = root?.querySelector(".plamo-panel");
            if (!accordion || mounted.has(root)) continue;
            mounted.add(root);
            rememberAccordion(accordion, tab);
            panels.set(tab, panelFor(root, tab));
        }
    }

    onUiLoaded(async () => {
        // Forge's initial settings_json is cached for this UI build. Fetch
        // current saved defaults so freshly opened browsers see new settings.
        try {
            const reply = await send("defaults", {});
            config = {...readDefaults(), ...reply.config, token: ""};
        } catch {
            config = readDefaults();
        }
        mount();
        void refreshModel();
        window.setInterval(() => {
            if (!document.hidden && !pending) void refreshModel();
        }, 10000);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && !pending) void refreshModel();
        });
    });
    onOptionsChanged(() => {
        for (const panel of panels.values()) panel.localize();
    });
    onAfterUiUpdate(() => {
        if (config) mount();
    });
})();

