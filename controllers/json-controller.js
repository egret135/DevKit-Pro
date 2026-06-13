/**
 * JsonController - JSON format and compare functionality
 */
(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    let ctx = null;
    let currentSubView = 'format';
    let debouncedCompare = null;
    let structuralHunks = [];
    let structuralHunkIdx = -1;
    let isCompareUpdating = false;
    let debouncedAutoFormat = null;
    let debouncedAutoValidate = null;
    let isAutoFormatting = false;
    let formatInProgress = false;
    let formatTaskId = 0;
    let formatPipelineTimer = null;
    let hintsRefreshHandle = null;
    let inputErrorMark = null;
    let inputErrorLineMark = null;

    function init(appCtx) {
        ctx = appCtx;
        const el = ctx.elements;

        debouncedCompare = ctx.debounce(handleCompare, 300);

        initSubNav();
        initFormatView();
        initCompareView();

        const savedSubView = ctx.getSettings().jsonSubView;
        if (savedSubView === 'compare') {
            switchSubView('compare');
        }
    }

    function getIndentSetting() {
        return ctx.getSettings().formatIndent ?? 4;
    }

    function getFormatOptions() {
        const profile = JsonUtils.getDocumentProfile(getFormatInput());
        return {
            indent: getIndentSetting(),
            expandEscapedStrings: !profile.isLarge && isExpandEscapedEnabled()
        };
    }

    function getAdaptiveDebounceMs(text) {
        const profile = JsonUtils.getDocumentProfile(text);
        if (profile.useWorker) return 1200;
        if (profile.isLarge) return 800;
        return 400;
    }

    function updateEditorPerformanceModes() {
        const inputText = getFormatInput();
        const outputText = getFormatOutput();
        editorManager.setPerformanceMode('jsonFormatInput', JsonUtils.shouldUsePlainTextMode(inputText));
        editorManager.setPerformanceMode('jsonFormatOutput', JsonUtils.shouldUsePlainTextMode(outputText));
    }

    function cancelDeferredHintsRefresh() {
        if (!hintsRefreshHandle) return;
        if (typeof cancelIdleCallback !== 'undefined') {
            cancelIdleCallback(hintsRefreshHandle);
        } else {
            clearTimeout(hintsRefreshHandle);
        }
        hintsRefreshHandle = null;
    }

    function deferRefreshFormatOutputHints(formatted) {
        cancelDeferredHintsRefresh();

        const profile = JsonUtils.getDocumentProfile(formatted || '');
        if (profile.disableHints) {
            refreshFormatOutputHints(formatted || '');
            return;
        }

        const run = () => {
            hintsRefreshHandle = null;
            refreshFormatOutputHints(formatted || '');
        };

        if (typeof requestIdleCallback !== 'undefined') {
            hintsRefreshHandle = requestIdleCallback(run, { timeout: 1500 });
        } else {
            hintsRefreshHandle = setTimeout(run, 60);
        }
    }

    function formatInputText(text) {
        const options = getFormatOptions();
        if (typeof JsonWorkerClient !== 'undefined' && JsonWorkerClient.shouldUseWorker(text)) {
            return JsonWorkerClient.format(text, options);
        }
        return Promise.resolve(formatForOutput(text));
    }

    function minifyInputText(text) {
        if (typeof JsonWorkerClient !== 'undefined' && JsonWorkerClient.shouldUseWorker(text)) {
            return JsonWorkerClient.minify(text);
        }
        return Promise.resolve(JsonUtils.minify(text));
    }

    function sortInputText(text) {
        const options = getFormatOptions();
        if (typeof JsonWorkerClient !== 'undefined' && JsonWorkerClient.shouldUseWorker(text)) {
            return JsonWorkerClient.sortAndFormat(text, options);
        }
        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) throw new Error(parsed.error);
        return Promise.resolve(formatForOutput(JsonUtils.sortKeys(parsed.value)));
    }

    function scheduleFormatPipeline() {
        const text = getFormatInput();
        const wait = getAdaptiveDebounceMs(text);
        updateEditorPerformanceModes();
        clearTimeout(formatPipelineTimer);
        formatPipelineTimer = setTimeout(() => {
            runAutoValidate();
            if (isAutoFormatEnabled()) {
                runAutoFormat();
            }
        }, wait);
    }

    function isExpandEscapedEnabled() {
        const checkbox = document.getElementById('jsonExpandEscaped');
        if (checkbox) return checkbox.checked;
        return ctx.getSettings().jsonExpandEscapedStrings === true;
    }

    function formatForOutput(value) {
        return JsonUtils.format(value, getFormatOptions());
    }

    function formatCanonical(value) {
        return JsonUtils.formatCanonical(value, { indent: getIndentSetting() });
    }

    function rerenderFormatOutput() {
        const text = getFormatInput();
        if (!text.trim()) return;

        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) return;

        const taskId = ++formatTaskId;
        formatInProgress = true;
        updateFormatMeta();

        formatInputText(text)
            .then((formatted) => {
                if (taskId !== formatTaskId) return;
                setFormatOutput(formatted);
            })
            .finally(() => {
                if (taskId !== formatTaskId) return;
                formatInProgress = false;
                updateFormatMeta();
            });
    }

    function getFormatInput() {
        return editorManager.getValue('jsonFormatInput');
    }

    function getFormatOutput() {
        return editorManager.getValue('jsonFormatOutput');
    }

    function setFormatInput(value) {
        editorManager.setValue('jsonFormatInput', value);
        updateFormatMeta();
    }

    function setFormatOutput(value) {
        hideFormatError();
        const outputEditor = editorManager.get('jsonFormatOutput');
        const scroll = outputEditor?.getScrollInfo();
        editorManager.setValue('jsonFormatOutput', value || '');
        updateFormatMeta();
        updateEditorPerformanceModes();
        deferRefreshFormatOutputHints(value || '');
        restoreEditorScroll('jsonFormatOutput', scroll);
    }

    function clearInputErrorMarks() {
        if (inputErrorMark) {
            inputErrorMark.clear();
            inputErrorMark = null;
        }
        if (inputErrorLineMark) {
            inputErrorLineMark.clear();
            inputErrorLineMark = null;
        }
    }

    function markInputError(text, position) {
        clearInputErrorMarks();
        if (!position) return;

        const editor = editorManager.get('jsonFormatInput');
        if (!editor) return;

        const line = Math.max(0, position.line - 1);
        const ch = Math.max(0, position.col - 1);
        const lineText = (text.split('\n')[line] || '');
        const endCh = Math.min(lineText.length, ch + Math.max(1, (position.char || lineText[ch] || ' ').length));

        inputErrorLineMark = editor.markText(
            { line, ch: 0 },
            { line, ch: lineText.length },
            { className: 'json-input-error-line' }
        );
        inputErrorMark = editor.markText(
            { line, ch },
            { line, ch: endCh },
            { className: 'json-input-error-mark' }
        );
    }

    function jumpToInputError(position) {
        const editor = editorManager.get('jsonFormatInput');
        if (!editor || !position) return;

        const line = Math.max(0, position.line - 1);
        const ch = Math.max(0, position.col - 1);
        editor.setCursor({ line, ch });
        editor.focus();
        editor.scrollIntoView({ line, ch }, 120);
    }

    function renderFormatErrorHtml(report) {
        const pos = report.position;
        const ctx = report.context;
        const location = pos
            ? `第 <strong>${pos.line}</strong> 行，第 <strong>${pos.col}</strong> 列`
            + (pos.index != null ? ` · 字符位置 <strong>${pos.index}</strong>` : '')
            : '无法定位具体位置';

        let snippetHtml = '';
        if (ctx) {
            const prevLine = ctx.before.length ? ctx.before[ctx.before.length - 1] : '';
            const nextLine = ctx.after.length ? ctx.after[0] : '';
            snippetHtml = `
                <div class="json-error-snippet">
                    ${prevLine ? `<div class="json-error-snippet-line dim"><span class="ln">${ctx.line - 1}</span>${escapeHtml(prevLine)}</div>` : ''}
                    <div class="json-error-snippet-line error-line">
                        <span class="ln">${ctx.line}</span>${escapeHtml(ctx.lineText)}
                    </div>
                    <div class="json-error-snippet-pointer"><span class="ln"></span>${escapeHtml(ctx.pointer)}</div>
                    ${nextLine ? `<div class="json-error-snippet-line dim"><span class="ln">${ctx.line + 1}</span>${escapeHtml(nextLine)}</div>` : ''}
                </div>`;
        }

        return `
            <div class="json-error-card">
                <div class="json-error-header">
                    <span class="json-error-icon">!</span>
                    <div>
                        <div class="json-error-title">${escapeHtml(report.title)}</div>
                        <div class="json-error-summary">${escapeHtml(report.summary)}</div>
                    </div>
                </div>
                <div class="json-error-location">${location}</div>
                ${ctx && ctx.char ? `<div class="json-error-char">问题字符：<code>${escapeHtml(ctx.char === '\n' ? '\\n' : ctx.char)}</code></div>` : ''}
                ${snippetHtml}
                <div class="json-error-hint">${escapeHtml(report.hint)}</div>
                <details class="json-error-details">
                    <summary>查看原始错误信息</summary>
                    <pre>${escapeHtml(report.rawError)}</pre>
                </details>
                ${pos ? '<button type="button" class="tool-btn-action tech-btn json-error-jump-btn">跳转到错误位置</button>' : ''}
            </div>`;
    }

    function showFormatError(text, parsed) {
        const report = JsonUtils.buildErrorReport(text, parsed);
        const view = document.getElementById('jsonFormatErrorView');
        const body = document.querySelector('.json-format-output-body');
        if (!view || !body || !report) return;

        view.innerHTML = renderFormatErrorHtml(report);
        view.classList.remove('hidden');
        body.classList.add('is-error');
        body.classList.remove('is-valid-hint');

        editorManager.setValue('jsonFormatOutput', '');
        refreshFormatOutputHints('');

        markInputError(text, report.position);

        view.querySelector('.json-error-jump-btn')?.addEventListener('click', () => {
            jumpToInputError(report.position);
        });
    }

    function hideFormatError() {
        const view = document.getElementById('jsonFormatErrorView');
        const body = document.querySelector('.json-format-output-body');
        view?.classList.add('hidden');
        view && (view.innerHTML = '');
        body?.classList.remove('is-error', 'is-valid-hint');
        clearInputErrorMarks();
    }

    function showFormatValidHint() {
        const view = document.getElementById('jsonFormatErrorView');
        const body = document.querySelector('.json-format-output-body');
        if (!view || !body) return;

        if (getFormatOutput().trim()) {
            hideFormatError();
            return;
        }

        view.innerHTML = `
            <div class="json-valid-card">
                <span class="json-valid-icon">✓</span>
                <div class="json-valid-title">JSON 格式正确</div>
                <div class="json-valid-hint">可点击「格式化」查看结果，或开启「自动格式化」</div>
            </div>`;
        view.classList.remove('hidden');
        body.classList.add('is-valid-hint');
        body.classList.remove('is-error');
        clearInputErrorMarks();
    }

    function refreshFormatOutputHints(formatted) {
        const editor = editorManager.get('jsonFormatOutput');
        const expanded = isExpandEscapedEnabled();

        if (typeof JsonArrayHints !== 'undefined') {
            if (expanded) JsonArrayHints.clear(editor);
            else JsonArrayHints.refreshEditor(editor, formatted);
        }

        if (typeof JsonValueInteraction !== 'undefined') {
            if (expanded) JsonValueInteraction.refreshEditor(editor, '');
            else JsonValueInteraction.refreshEditor(editor, formatted);
        }

        editor?.getWrapperElement()?.classList.toggle('json-output-expanded-view', expanded);
    }

    function setEditorValuePreserveScroll(editorId, value) {
        const editor = editorManager.get(editorId);
        if (!editor) {
            editorManager.setValue(editorId, value);
            return;
        }

        const scroll = editor.getScrollInfo();
        editor.setValue(value);
        editor.scrollTo(scroll.left, scroll.top);
    }

    function restoreEditorScroll(editorId, scroll) {
        const editor = editorManager.get(editorId);
        if (!editor || !scroll) return;
        editor.scrollTo(scroll.left, scroll.top);
    }

    function syncInputFromOutputEdit(path, newValue) {
        const parsed = JsonUtils.parse(getFormatInput());
        if (!parsed.ok) {
            ctx.setStatus('左侧 JSON 无效，无法回写', 'error');
            return;
        }

        const root = JSON.parse(JSON.stringify(parsed.value));
        JsonValueInteraction.setAtPath(root, path, newValue);

        const newInputText = formatCanonical(root);
        const newOutputText = formatForOutput(root);

        const outputEditor = editorManager.get('jsonFormatOutput');
        const inputEditor = editorManager.get('jsonFormatInput');
        const outputScroll = outputEditor?.getScrollInfo();
        const inputScroll = inputEditor?.getScrollInfo();

        isAutoFormatting = true;
        setEditorValuePreserveScroll('jsonFormatInput', newInputText);
        setEditorValuePreserveScroll('jsonFormatOutput', newOutputText);
        isAutoFormatting = false;

        updateFormatMeta();
        refreshFormatOutputHints(newOutputText);

        restoreEditorScroll('jsonFormatInput', inputScroll);
        restoreEditorScroll('jsonFormatOutput', outputScroll);

        ctx.setStatus('字段已更新并同步到输入', 'success');
    }

    function updateFormatMeta() {
        const metaEl = document.getElementById('jsonFormatMeta');
        if (!metaEl) return;

        const inputText = getFormatInput();
        const outputText = getFormatOutput();
        const inputLines = inputText ? inputText.split('\n').length : 0;
        const outputLines = outputText ? outputText.split('\n').length : 0;
        const profile = JsonUtils.getDocumentProfile(inputText);
        let meta = `输入 ${inputLines} 行 · 输出 ${outputLines} 行`;

        if (profile.charCount > 0) {
            const sizeLabel = profile.charCount < 1024 * 1024
                ? `${(profile.charCount / 1024).toFixed(1)} KB`
                : `${(profile.charCount / (1024 * 1024)).toFixed(2)} MB`;
            meta += ` · ${sizeLabel}`;
            if (profile.isLarge) meta += ' · 大文档模式';
            if (formatInProgress) meta += ' · 处理中…';
        }

        metaEl.textContent = meta;
    }

    function initSubNav() {
        document.getElementById('jsonSubFormat')?.addEventListener('click', () => switchSubView('format'));
        document.getElementById('jsonSubCompare')?.addEventListener('click', () => switchSubView('compare'));
    }

    function switchSubView(view) {
        currentSubView = view;
        ctx.getSettings().jsonSubView = view;
        Settings.save(ctx.getSettings());

        document.getElementById('jsonSubFormat')?.classList.toggle('active', view === 'format');
        document.getElementById('jsonSubCompare')?.classList.toggle('active', view === 'compare');
        document.getElementById('jsonFormatView')?.classList.toggle('hidden', view !== 'format');
        document.getElementById('jsonCompareView')?.classList.toggle('hidden', view !== 'compare');

        if (view === 'format') {
            ctx.refreshEditorsIn('jsonFormatInput', 'jsonFormatOutput');
            refreshFormatOutputHints(getFormatOutput());
            runAutoValidate();
            ctx.setStatus('JSON 格式化', 'ready');
        } else {
            ctx.refreshEditorsIn('jsonCompareA', 'jsonCompareB');
            handleCompare();
            ctx.setStatus('JSON 对比', 'ready');
        }
    }

    function isAutoFormatEnabled() {
        const checkbox = document.getElementById('jsonAutoFormat');
        if (checkbox) return checkbox.checked;
        return ctx.getSettings().jsonAutoFormat !== false;
    }

    function initFormatView() {
        configureJsonEditorFolding('jsonFormatInput');
        configureJsonEditorFolding('jsonFormatOutput');
        updateEditorPerformanceModes();

        const formatEditor = editorManager.get('jsonFormatInput');
        formatEditor?.on('change', () => {
            updateFormatMeta();
            scheduleFormatPipeline();
        });

        const autoFormatCheckbox = document.getElementById('jsonAutoFormat');
        if (autoFormatCheckbox) {
            autoFormatCheckbox.checked = ctx.getSettings().jsonAutoFormat !== false;
            autoFormatCheckbox.addEventListener('change', () => {
                ctx.getSettings().jsonAutoFormat = autoFormatCheckbox.checked;
                Settings.save(ctx.getSettings());
                if (autoFormatCheckbox.checked) {
                    runAutoValidate();
                    runAutoFormat();
                } else {
                    runAutoValidate();
                }
            });
        }

        const expandEscapedCheckbox = document.getElementById('jsonExpandEscaped');
        if (expandEscapedCheckbox) {
            expandEscapedCheckbox.checked = ctx.getSettings().jsonExpandEscapedStrings === true;
            expandEscapedCheckbox.addEventListener('change', () => {
                ctx.getSettings().jsonExpandEscapedStrings = expandEscapedCheckbox.checked;
                Settings.save(ctx.getSettings());
                rerenderFormatOutput();
            });
        }

        document.getElementById('jsonFormatBtn')?.addEventListener('click', handleFormat);
        document.getElementById('jsonMinifyBtn')?.addEventListener('click', handleMinify);
        document.getElementById('jsonSortKeysBtn')?.addEventListener('click', handleSortKeys);
        document.getElementById('jsonCopyBtn')?.addEventListener('click', handleCopy);
        document.getElementById('jsonApplyToInputBtn')?.addEventListener('click', handleApplyToInput);
        document.getElementById('jsonClearBtn')?.addEventListener('click', handleClear);
        document.getElementById('jsonFoldAllBtn')?.addEventListener('click', () => {
            editorManager.foldAll('jsonFormatOutput');
            ctx.setStatus('已折叠全部节点', 'ready');
        });
        document.getElementById('jsonUnfoldAllBtn')?.addEventListener('click', () => {
            editorManager.unfoldAll('jsonFormatOutput');
            ctx.setStatus('已展开全部节点', 'ready');
        });

        const outputEditor = editorManager.get('jsonFormatOutput');
        if (outputEditor && typeof JsonValueInteraction !== 'undefined') {
            JsonValueInteraction.init(outputEditor, {
                onCopyError: () => ctx.setStatus('复制失败', 'error'),
                onEditError: () => ctx.setStatus('字段值无效，请检查类型', 'error'),
                onValueChange: (path, newValue) => syncInputFromOutputEdit(path, newValue)
            });
        }
    }

    function configureJsonEditorFolding(editorId) {
        const editor = editorManager.get(editorId);
        if (!editor || typeof CodeMirror === 'undefined') return;

        editor.setOption('foldGutter', true);
        editor.setOption('gutters', ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']);

        if (CodeMirror.fold && CodeMirror.fold.brace) {
            const foldOptions = {
                rangeFinder: CodeMirror.fold.brace
            };
            if (typeof JsonArrayHints !== 'undefined') {
                foldOptions.widget = JsonArrayHints.createFoldWidget(editor);
            }
            editor.setOption('foldOptions', foldOptions);
        }

        const extraKeys = editor.getOption('extraKeys') || {};
        editor.setOption('extraKeys', {
            ...extraKeys,
            'Ctrl-Q': (cm) => cm.foldCode(cm.getCursor()),
            'Cmd-Q': (cm) => cm.foldCode(cm.getCursor())
        });
    }

    function runAutoValidate() {
        if (isAutoFormatting || formatInProgress) return;

        const text = getFormatInput();
        if (!text.trim()) {
            hideFormatError();
            return;
        }

        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) {
            showFormatError(text, parsed);
            return;
        }

        if (isAutoFormatEnabled() && getFormatOutput().trim()) {
            hideFormatError();
            return;
        }

        if (!isAutoFormatEnabled() && !getFormatOutput().trim()) {
            showFormatValidHint();
            return;
        }

        hideFormatError();
    }

    function runAutoFormat() {
        if (isAutoFormatting || formatInProgress || !isAutoFormatEnabled()) return;

        const text = getFormatInput();
        if (!text.trim()) {
            setFormatOutput('');
            hideFormatError();
            return;
        }

        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) {
            showFormatError(text, parsed);
            editorManager.setValue('jsonFormatOutput', '');
            refreshFormatOutputHints('');
            return;
        }

        const taskId = ++formatTaskId;
        formatInProgress = true;
        isAutoFormatting = true;
        updateFormatMeta();

        formatInputText(text)
            .then((formatted) => {
                if (taskId !== formatTaskId) return;

                if (formatted !== getFormatOutput()) {
                    setFormatOutput(formatted);
                } else {
                    deferRefreshFormatOutputHints(formatted);
                }
                hideFormatError();
            })
            .catch(() => {
                // ignore while typing incomplete JSON
            })
            .finally(() => {
                if (taskId !== formatTaskId) return;
                formatInProgress = false;
                isAutoFormatting = false;
                updateFormatMeta();
                runAutoValidate();
            });
    }

    function handleFormat() {
        const text = getFormatInput();
        if (!text.trim()) {
            ctx.setStatus('请输入 JSON', 'error');
            return;
        }

        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) {
            showFormatError(text, parsed);
            ctx.setStatus(`格式化失败: ${parsed.error}`, 'error');
            return;
        }

        const taskId = ++formatTaskId;
        formatInProgress = true;
        ctx.setStatus('正在格式化...', 'processing');
        updateFormatMeta();

        formatInputText(text)
            .then((formatted) => {
                if (taskId !== formatTaskId) return;
                setFormatOutput(formatted);
                ctx.setStatus('JSON 已格式化', 'success');
            })
            .catch((e) => {
                if (taskId !== formatTaskId) return;
                editorManager.setValue('jsonFormatOutput', '');
                refreshFormatOutputHints('');
                ctx.setStatus(`格式化失败: ${e.message}`, 'error');
            })
            .finally(() => {
                if (taskId !== formatTaskId) return;
                formatInProgress = false;
                updateFormatMeta();
            });
    }

    function handleMinify() {
        const text = getFormatInput();
        if (!text.trim()) {
            ctx.setStatus('请输入 JSON', 'error');
            return;
        }

        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) {
            showFormatError(text, parsed);
            ctx.setStatus(`压缩失败: ${parsed.error}`, 'error');
            return;
        }

        const taskId = ++formatTaskId;
        formatInProgress = true;
        ctx.setStatus('正在压缩...', 'processing');
        updateFormatMeta();

        minifyInputText(text)
            .then((minified) => {
                if (taskId !== formatTaskId) return;
                setFormatOutput(minified);
                ctx.setStatus('JSON 已压缩', 'success');
            })
            .catch((e) => {
                if (taskId !== formatTaskId) return;
                editorManager.setValue('jsonFormatOutput', '');
                refreshFormatOutputHints('');
                ctx.setStatus(`压缩失败: ${e.message}`, 'error');
            })
            .finally(() => {
                if (taskId !== formatTaskId) return;
                formatInProgress = false;
                updateFormatMeta();
            });
    }

    function handleSortKeys() {
        const text = getFormatInput();
        if (!text.trim()) {
            ctx.setStatus('请输入 JSON', 'error');
            return;
        }

        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) {
            showFormatError(text, parsed);
            ctx.setStatus(`排序失败: ${parsed.error}`, 'error');
            return;
        }

        const taskId = ++formatTaskId;
        formatInProgress = true;
        ctx.setStatus('正在排序...', 'processing');
        updateFormatMeta();

        sortInputText(text)
            .then((sorted) => {
                if (taskId !== formatTaskId) return;
                setFormatOutput(sorted);
                ctx.setStatus('Key 已排序并格式化', 'success');
            })
            .catch((e) => {
                if (taskId !== formatTaskId) return;
                ctx.setStatus(`排序失败: ${e.message}`, 'error');
            })
            .finally(() => {
                if (taskId !== formatTaskId) return;
                formatInProgress = false;
                updateFormatMeta();
            });
    }

    function getSyncableOutputText() {
        const outputText = getFormatOutput().trim();
        if (!outputText) return null;

        if (isExpandEscapedEnabled()) {
            const parsed = JsonUtils.parse(getFormatInput());
            if (!parsed.ok) return null;
            return formatCanonical(parsed.value);
        }

        const outputParsed = JsonUtils.parse(outputText);
        if (!outputParsed.ok) return null;
        return outputText;
    }

    function handleApplyToInput() {
        const textToApply = getSyncableOutputText();
        if (!textToApply) {
            ctx.setStatus('没有可应用的结果，请先格式化', 'error');
            return;
        }

        isAutoFormatting = true;
        setEditorValuePreserveScroll('jsonFormatInput', textToApply);
        isAutoFormatting = false;

        updateFormatMeta();
        runAutoValidate();
        ctx.setStatus('已应用到输入', 'success');
    }

    function handleCopy() {
        const text = getSyncableOutputText();
        if (!text) {
            ctx.setStatus('没有可复制的内容，请先格式化', 'error');
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('jsonCopyBtn');
            btn?.classList.add('copied');
            setTimeout(() => btn?.classList.remove('copied'), 600);
            if (isExpandEscapedEnabled()) {
                ctx.setStatus('已复制标准 JSON', 'success');
            }
        }).catch(() => ctx.setStatus('复制失败', 'error'));
    }

    function handleClear() {
        setFormatInput('');
        editorManager.setValue('jsonFormatOutput', '');
        hideFormatError();
        refreshFormatOutputHints('');
        updateFormatMeta();
        ctx.setStatus('已清空', 'ready');
    }

    function initCompareView() {
        const editorA = editorManager.get('jsonCompareA');
        const editorB = editorManager.get('jsonCompareB');

        editorA?.on('change', () => {
            if (!isCompareUpdating) debouncedCompare();
        });
        editorB?.on('change', () => {
            if (!isCompareUpdating) debouncedCompare();
        });

        if (typeof JsonCmDiff !== 'undefined') {
            JsonCmDiff.linkScrollPair(editorA, editorB, 'jsonCompareGutterA', 'jsonCompareGutterB');
        }

        document.getElementById('jsonCompareBtn')?.addEventListener('click', handleCompare);
        document.getElementById('jsonCompareSwapBtn')?.addEventListener('click', handleSwap);
        document.getElementById('jsonCompareClearBtn')?.addEventListener('click', handleCompareClear);

        document.getElementById('jsonSortKeysOnCompare')?.addEventListener('change', () => {
            ctx.getSettings().jsonSortKeysOnCompare = document.getElementById('jsonSortKeysOnCompare')?.checked || false;
            Settings.save(ctx.getSettings());
            handleCompare();
        });

        document.getElementById('jsonStructuralPrevBtn')?.addEventListener('click', () => navigateStructural(-1));
        document.getElementById('jsonStructuralNextBtn')?.addEventListener('click', () => navigateStructural(1));

        const fsBtn = document.getElementById('jsonCompareFullscreenBtn');
        const panel = document.getElementById('jsonCompareView');
        if (fsBtn && panel) {
            fsBtn.addEventListener('click', () => {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    panel.requestFullscreen();
                }
            });
            document.addEventListener('fullscreenchange', () => {
                const isFs = document.fullscreenElement === panel;
                fsBtn.querySelector('.cdiff-icon-expand').style.display = isFs ? 'none' : '';
                fsBtn.querySelector('.cdiff-icon-collapse').style.display = isFs ? '' : 'none';
            });
        }

        const sortCheckbox = document.getElementById('jsonSortKeysOnCompare');
        if (sortCheckbox) {
            sortCheckbox.checked = ctx.getSettings().jsonSortKeysOnCompare !== false;
        }
    }

    function clearCompareEditorDiff() {
        const editorA = editorManager.get('jsonCompareA');
        const editorB = editorManager.get('jsonCompareB');

        if (typeof JsonCmDiff !== 'undefined') {
            JsonCmDiff.clearEditor(editorA);
            JsonCmDiff.clearEditor(editorB);
            JsonCmDiff.clearGutter('jsonCompareGutterA');
            JsonCmDiff.clearGutter('jsonCompareGutterB');
        }

        structuralHunks = [];
        structuralHunkIdx = -1;
        updateStructuralNavPos();
    }

    function applyInlineEditorDiff(textA, textB) {
        const errorEl = document.getElementById('jsonCompareError');
        const editorA = editorManager.get('jsonCompareA');
        const editorB = editorManager.get('jsonCompareB');

        if (!textA.trim() && !textB.trim()) {
            clearCompareEditorDiff();
            if (errorEl) errorEl.textContent = '';
            return { ok: true, empty: true };
        }

        const sortKeys = document.getElementById('jsonSortKeysOnCompare')?.checked !== false;
        const normalized = JsonUtils.normalizeForCompare(textA, textB, {
            sortKeys,
            indent: getIndentSetting()
        });

        if (!normalized.ok) {
            const msg = normalized.errorA
                ? `JSON A 解析错误: ${normalized.errorA}`
                : `JSON B 解析错误: ${normalized.errorB}`;
            if (errorEl) errorEl.textContent = msg;
            clearCompareEditorDiff();
            return { ok: false, error: msg };
        }

        if (errorEl) errorEl.textContent = '';

        isCompareUpdating = true;
        editorManager.setValue('jsonCompareA', normalized.textA);
        editorManager.setValue('jsonCompareB', normalized.textB);
        isCompareUpdating = false;

        const linesA = normalized.textA.split('\n');
        const linesB = normalized.textB.split('\n');
        const lineDiff = DiffLines.computeLineDiff(linesA, linesB);

        if (typeof JsonCmDiff !== 'undefined') {
            JsonCmDiff.applyLineStatus(editorA, lineDiff.statusA);
            JsonCmDiff.applyLineStatus(editorB, lineDiff.statusB);

            const lineHeight = JsonCmDiff.getLineHeight(editorA);
            JsonCmDiff.renderGutter('jsonCompareGutterA', linesA.length, lineDiff.statusA, lineHeight);
            JsonCmDiff.renderGutter('jsonCompareGutterB', linesB.length, lineDiff.statusB, lineHeight);
        }

        return { ok: true, lineDiff, normalized };
    }

    function getCompareTexts() {
        return {
            a: editorManager.getValue('jsonCompareA'),
            b: editorManager.getValue('jsonCompareB')
        };
    }

    function handleCompare() {
        if (currentSubView !== 'compare') return;

        const { a, b } = getCompareTexts();
        runCompare(a, b);
    }

    function runCompare(textA, textB) {
        const statsEl = document.getElementById('jsonStructuralStats');
        const editorA = editorManager.get('jsonCompareA');
        const editorB = editorManager.get('jsonCompareB');

        if (!textA.trim() && !textB.trim()) {
            clearCompareEditorDiff();
            if (statsEl) statsEl.textContent = '';
            return;
        }

        const inline = applyInlineEditorDiff(textA, textB);
        if (!inline.ok) {
            if (statsEl) statsEl.textContent = '';
            structuralHunks = [];
            structuralHunkIdx = -1;
            updateStructuralNavPos();
            ctx.setStatus('JSON 对比失败', 'error');
            return;
        }

        if (inline.empty) {
            if (statsEl) statsEl.textContent = '';
            return;
        }

        const sortKeys = document.getElementById('jsonSortKeysOnCompare')?.checked !== false;
        const result = jsonDiffEngine.diffFromText(textA, textB, { sortKeys });

        if (!result.ok) {
            if (statsEl) statsEl.textContent = '';
            structuralHunks = [];
            structuralHunkIdx = -1;
            updateStructuralNavPos();
            ctx.setStatus('JSON 对比失败', 'error');
            return;
        }

        const { stats, changes } = result;
        if (statsEl) {
            statsEl.innerHTML =
                `<span class="cdiff-stat-add">+${stats.added}</span> ` +
                `<span class="cdiff-stat-rm">-${stats.removed}</span> ` +
                `<span class="cdiff-stat-mod">~${stats.changed}</span>`;
        }

        structuralHunks = changes.map((change) => ({
            path: change.path,
            lineA: typeof JsonCmDiff !== 'undefined'
                ? JsonCmDiff.findLineForPath(editorA, change.path)
                : 0,
            lineB: typeof JsonCmDiff !== 'undefined'
                ? JsonCmDiff.findLineForPath(editorB, change.path)
                : 0
        }));
        structuralHunkIdx = -1;
        updateStructuralNavPos();
        ctx.setStatus(changes.length === 0 ? '两个 JSON 完全相同' : 'JSON 对比完成', 'success');
    }

    function handleSwap() {
        const a = editorManager.getValue('jsonCompareA');
        const b = editorManager.getValue('jsonCompareB');
        editorManager.setValue('jsonCompareA', b);
        editorManager.setValue('jsonCompareB', a);
        handleCompare();
    }

    function handleCompareClear() {
        editorManager.setValue('jsonCompareA', '');
        editorManager.setValue('jsonCompareB', '');
        handleCompare();
        ctx.setStatus('对比内容已清空', 'ready');
    }

    function navigateStructural(direction) {
        if (structuralHunks.length === 0) return;
        structuralHunkIdx += direction;
        if (structuralHunkIdx < 0) structuralHunkIdx = structuralHunks.length - 1;
        if (structuralHunkIdx >= structuralHunks.length) structuralHunkIdx = 0;
        updateStructuralNavPos();

        const hunk = structuralHunks[structuralHunkIdx];
        const editorA = editorManager.get('jsonCompareA');
        const editorB = editorManager.get('jsonCompareB');

        if (typeof JsonCmDiff !== 'undefined') {
            JsonCmDiff.scrollEditorToLine(editorA, hunk.lineA);
            JsonCmDiff.scrollEditorToLine(editorB, hunk.lineB);
            if (editorB) {
                editorB.scrollTo(editorA.getScrollInfo().left, editorA.getScrollInfo().top);
            }
        }
    }

    function updateStructuralNavPos() {
        const posEl = document.getElementById('jsonStructuralNavPos');
        if (posEl) {
            if (structuralHunks.length === 0) {
                posEl.textContent = '';
            } else if (structuralHunkIdx >= 0) {
                posEl.textContent = `${structuralHunkIdx + 1}/${structuralHunks.length}`;
            } else {
                posEl.textContent = `${structuralHunks.length} 处`;
            }
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function loadContent(content, subView) {
        if (subView === 'compare') {
            editorManager.setValue('jsonCompareA', content);
            switchSubView('compare');
        } else {
            setFormatInput(content);
            switchSubView('format');
            handleFormat();
        }
    }

    DevKit.JsonController = {
        init,
        switchSubView,
        loadContent,
        handleFormat,
        handleCompare
    };
})();
