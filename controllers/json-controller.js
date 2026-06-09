/**
 * JsonController - JSON format and compare functionality
 */
(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    let ctx = null;
    let currentSubView = 'format';
    let currentCompareMode = 'structural';
    let debouncedCompare = null;
    let structuralHunks = [];
    let structuralHunkIdx = -1;
    let sideBySideHunks = [];
    let sideBySideHunkIdx = -1;
    let debouncedAutoFormat = null;
    let debouncedAutoValidate = null;
    let isAutoFormatting = false;
    let inputErrorMark = null;
    let inputErrorLineMark = null;

    function init(appCtx) {
        ctx = appCtx;
        const el = ctx.elements;

        debouncedCompare = ctx.debounce(handleCompare, 300);

        initSubNav();
        initFormatView();
        initCompareView();

        const savedCompareMode = ctx.getSettings().jsonCompareMode;
        if (savedCompareMode === 'sideBySide') {
            switchCompareMode('sideBySide');
        }

        const savedSubView = ctx.getSettings().jsonSubView;
        if (savedSubView === 'compare') {
            switchSubView('compare');
        }
    }

    function getIndentSetting() {
        return ctx.getSettings().formatIndent ?? 4;
    }

    function getFormatOptions() {
        return {
            indent: getIndentSetting(),
            expandEscapedStrings: isExpandEscapedEnabled()
        };
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

        const outputEditor = editorManager.get('jsonFormatOutput');
        const scroll = outputEditor?.getScrollInfo();
        setFormatOutput(formatForOutput(parsed.value));
        restoreEditorScroll('jsonFormatOutput', scroll);
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
        editorManager.setValue('jsonFormatOutput', value || '');
        updateFormatMeta();
        refreshFormatOutputHints(value || '');
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
        const inputLines = getFormatInput() ? getFormatInput().split('\n').length : 0;
        const outputLines = getFormatOutput() ? getFormatOutput().split('\n').length : 0;
        metaEl.textContent = `输入 ${inputLines} 行 · 输出 ${outputLines} 行`;
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
        debouncedAutoFormat = ctx.debounce(runAutoFormat, 400);
        debouncedAutoValidate = ctx.debounce(runAutoValidate, 300);

        configureJsonEditorFolding('jsonFormatInput');
        configureJsonEditorFolding('jsonFormatOutput');

        const formatEditor = editorManager.get('jsonFormatInput');
        formatEditor?.on('change', () => {
            updateFormatMeta();
            debouncedAutoValidate();
            if (isAutoFormatEnabled()) {
                debouncedAutoFormat();
            }
        });
        formatEditor?.on('paste', () => {
            setTimeout(() => {
                runAutoValidate();
                if (isAutoFormatEnabled()) runAutoFormat();
            }, 50);
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
        if (isAutoFormatting) return;

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
        if (isAutoFormatting || !isAutoFormatEnabled()) return;

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

        try {
            isAutoFormatting = true;
            const formatted = formatForOutput(text);
            if (formatted !== getFormatOutput()) {
                setFormatOutput(formatted);
            } else {
                refreshFormatOutputHints(formatted);
            }
        } catch (_) {
            // ignore while typing incomplete JSON
        } finally {
            isAutoFormatting = false;
        }
    }

    function handleFormat() {
        const text = getFormatInput();
        if (!text.trim()) {
            ctx.setStatus('请输入 JSON', 'error');
            return;
        }
        try {
            const formatted = formatForOutput(text);
            setFormatOutput(formatted);
            ctx.setStatus('JSON 已格式化', 'success');
        } catch (e) {
            const parsed = JsonUtils.parse(text);
            if (!parsed.ok) {
                showFormatError(text, parsed);
            }
            editorManager.setValue('jsonFormatOutput', '');
            refreshFormatOutputHints('');
            ctx.setStatus(`格式化失败: ${e.message}`, 'error');
        }
    }

    function handleMinify() {
        const text = getFormatInput();
        if (!text.trim()) {
            ctx.setStatus('请输入 JSON', 'error');
            return;
        }
        try {
            setFormatOutput(JsonUtils.minify(text));
            ctx.setStatus('JSON 已压缩', 'success');
        } catch (e) {
            const parsed = JsonUtils.parse(text);
            if (!parsed.ok) showFormatError(text, parsed);
            editorManager.setValue('jsonFormatOutput', '');
            refreshFormatOutputHints('');
            ctx.setStatus(`压缩失败: ${e.message}`, 'error');
        }
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
        const sorted = JsonUtils.sortKeys(parsed.value);
        setFormatOutput(formatForOutput(sorted));
        ctx.setStatus('Key 已排序并格式化', 'success');
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
        editorA?.on('change', debouncedCompare);
        editorB?.on('change', debouncedCompare);

        document.getElementById('jsonCompareModeStructural')?.addEventListener('click', () => switchCompareMode('structural'));
        document.getElementById('jsonCompareModeSideBySide')?.addEventListener('click', () => switchCompareMode('sideBySide'));

        document.getElementById('jsonCompareBtn')?.addEventListener('click', handleCompare);
        document.getElementById('jsonCompareSwapBtn')?.addEventListener('click', handleSwap);
        document.getElementById('jsonCompareClearBtn')?.addEventListener('click', handleCompareClear);

        document.getElementById('jsonSortKeysOnCompare')?.addEventListener('change', () => {
            ctx.getSettings().jsonSortKeysOnCompare = document.getElementById('jsonSortKeysOnCompare')?.checked || false;
            Settings.save(ctx.getSettings());
            handleCompare();
        });

        document.getElementById('jsonSideIgnoreWhitespace')?.addEventListener('change', handleCompare);

        document.getElementById('jsonStructuralPrevBtn')?.addEventListener('click', () => navigateStructural(-1));
        document.getElementById('jsonStructuralNextBtn')?.addEventListener('click', () => navigateStructural(1));

        document.getElementById('jsonSidePrevBtn')?.addEventListener('click', () => navigateSideBySide(-1));
        document.getElementById('jsonSideNextBtn')?.addEventListener('click', () => navigateSideBySide(1));

        setupPaneScroll('jsonSideDiffA', 'jsonSideGutterA', 'jsonSideBackdropA');
        setupPaneScroll('jsonSideDiffB', 'jsonSideGutterB', 'jsonSideBackdropB');

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

        const compareView = document.getElementById('jsonCompareView');
        if (compareView) {
            compareView.classList.add('json-mode-structural');
        }
    }

    function switchCompareMode(mode) {
        currentCompareMode = mode;
        ctx.getSettings().jsonCompareMode = mode;
        Settings.save(ctx.getSettings());

        document.getElementById('jsonCompareModeStructural')?.classList.toggle('active', mode === 'structural');
        document.getElementById('jsonCompareModeSideBySide')?.classList.toggle('active', mode === 'sideBySide');
        document.getElementById('jsonStructuralCompare')?.classList.toggle('hidden', mode !== 'structural');
        document.getElementById('jsonSideBySideCompare')?.classList.toggle('hidden', mode !== 'sideBySide');

        const compareView = document.getElementById('jsonCompareView');
        if (compareView) {
            compareView.classList.toggle('json-mode-structural', mode === 'structural');
            compareView.classList.toggle('json-mode-side-by-side', mode === 'sideBySide');
        }

        handleCompare();
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
        if (currentCompareMode === 'structural') {
            runStructuralCompare(a, b);
        } else {
            runSideBySideCompare(a, b);
        }
    }

    function runStructuralCompare(textA, textB) {
        const resultEl = document.getElementById('jsonStructuralResult');
        const statsEl = document.getElementById('jsonStructuralStats');
        if (!resultEl) return;

        if (!textA.trim() && !textB.trim()) {
            resultEl.innerHTML = '<span class="diff-unchanged">输入 JSON A 和 JSON B 开始对比</span>';
            if (statsEl) statsEl.textContent = '';
            structuralHunks = [];
            structuralHunkIdx = -1;
            updateStructuralNavPos();
            return;
        }

        const sortKeys = document.getElementById('jsonSortKeysOnCompare')?.checked !== false;
        const result = jsonDiffEngine.diffFromText(textA, textB, { sortKeys });

        if (!result.ok) {
            resultEl.innerHTML = `<span class="diff-removed">${escapeHtml(result.error)}</span>`;
            if (statsEl) statsEl.textContent = '';
            structuralHunks = [];
            structuralHunkIdx = -1;
            updateStructuralNavPos();
            ctx.setStatus('JSON 对比失败', 'error');
            return;
        }

        const { stats, lines } = result;
        if (statsEl) {
            statsEl.innerHTML =
                `<span class="cdiff-stat-add">+${stats.added}</span> ` +
                `<span class="cdiff-stat-rm">-${stats.removed}</span> ` +
                `<span class="cdiff-stat-mod">~${stats.changed}</span>`;
        }

        if (lines.length === 0) {
            resultEl.innerHTML = '<span class="diff-unchanged">两个 JSON 完全相同</span>';
        } else {
            resultEl.innerHTML = lines.join('\n');
        }

        structuralHunks = lines.map((_, idx) => idx);
        structuralHunkIdx = -1;
        updateStructuralNavPos();
        ctx.setStatus('JSON 对比完成', 'success');
    }

    function runSideBySideCompare(textA, textB) {
        const errorEl = document.getElementById('jsonSideError');
        const statsEl = document.getElementById('jsonSideStats');
        const textareaA = document.getElementById('jsonSideDiffA');
        const textareaB = document.getElementById('jsonSideDiffB');

        if (!textareaA || !textareaB) return;

        if (!textA.trim() && !textB.trim()) {
            textareaA.value = '';
            textareaB.value = '';
            clearSideBySideOverlays();
            if (errorEl) errorEl.textContent = '';
            if (statsEl) statsEl.textContent = '';
            return;
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
            textareaA.value = '';
            textareaB.value = '';
            clearSideBySideOverlays();
            ctx.setStatus('JSON 对比失败', 'error');
            return;
        }

        if (errorEl) errorEl.textContent = '';
        textareaA.value = normalized.textA;
        textareaB.value = normalized.textB;

        const ignoreWhitespace = document.getElementById('jsonSideIgnoreWhitespace')?.checked || false;
        const lineDiff = DiffLines.computeLineDiff(
            normalized.textA.split('\n'),
            normalized.textB.split('\n'),
            { ignoreWhitespace }
        );

        DiffLines.renderOverlay(
            'jsonSideGutterA',
            'jsonSideBackdropA',
            normalized.textA.split('\n').length,
            lineDiff.statusA
        );
        DiffLines.renderOverlay(
            'jsonSideGutterB',
            'jsonSideBackdropB',
            normalized.textB.split('\n').length,
            lineDiff.statusB
        );

        if (statsEl) {
            statsEl.innerHTML = DiffLines.formatStatsHtml(lineDiff.stats);
        }

        sideBySideHunks = DiffLines.mergeHunks(
            DiffLines.buildHunks(lineDiff.statusA, 'a'),
            DiffLines.buildHunks(lineDiff.statusB, 'b')
        );
        sideBySideHunkIdx = -1;
        updateSideNavPos();
        ctx.setStatus('JSON 并排对比完成', 'success');
    }

    function clearSideBySideOverlays() {
        ['jsonSideGutterA', 'jsonSideGutterB', 'jsonSideBackdropA', 'jsonSideBackdropB'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        sideBySideHunks = [];
        sideBySideHunkIdx = -1;
        updateSideNavPos();
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

        const resultEl = document.getElementById('jsonStructuralResult');
        const lineEl = resultEl?.children[structuralHunks[structuralHunkIdx]];
        if (lineEl) {
            lineEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            lineEl.classList.add('diff-highlight');
            setTimeout(() => lineEl.classList.remove('diff-highlight'), 1200);
        }
    }

    function updateStructuralNavPos() {
        const posEl = document.getElementById('jsonStructuralNavPos');
        if (posEl) {
            posEl.textContent = structuralHunks.length > 0
                ? `${structuralHunkIdx + 1}/${structuralHunks.length}`
                : '';
        }
    }

    function navigateSideBySide(direction) {
        if (sideBySideHunks.length === 0) return;
        sideBySideHunkIdx += direction;
        if (sideBySideHunkIdx < 0) sideBySideHunkIdx = sideBySideHunks.length - 1;
        if (sideBySideHunkIdx >= sideBySideHunks.length) sideBySideHunkIdx = 0;
        updateSideNavPos();

        const hunk = sideBySideHunks[sideBySideHunkIdx];
        const lineHeight = 20;
        const textarea = document.getElementById(hunk.side === 'a' ? 'jsonSideDiffA' : 'jsonSideDiffB');
        if (!textarea) return;

        textarea.scrollTop = Math.max(0, hunk.line * lineHeight - textarea.clientHeight / 3);
        const other = document.getElementById(hunk.side === 'a' ? 'jsonSideDiffB' : 'jsonSideDiffA');
        if (other) other.scrollTop = textarea.scrollTop;
        textarea.dispatchEvent(new Event('scroll'));
        other?.dispatchEvent(new Event('scroll'));
    }

    function updateSideNavPos() {
        const posEl = document.getElementById('jsonSideNavPos');
        if (posEl) {
            posEl.textContent = sideBySideHunks.length > 0
                ? `${sideBySideHunkIdx + 1}/${sideBySideHunks.length}`
                : '';
        }
    }

    function setupPaneScroll(textareaId, gutterId, backdropId) {
        const textarea = document.getElementById(textareaId);
        const gutter = document.getElementById(gutterId);
        const backdrop = document.getElementById(backdropId);
        if (!textarea) return;
        textarea.addEventListener('scroll', () => {
            if (gutter) gutter.scrollTop = textarea.scrollTop;
            if (backdrop) backdrop.scrollTop = textarea.scrollTop;
        });
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
        switchCompareMode,
        loadContent,
        handleFormat,
        handleCompare
    };
})();
