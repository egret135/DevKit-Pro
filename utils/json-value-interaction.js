// JSON Value Interaction - hover, click-to-copy, double-click-to-edit primitives

const JsonValueInteraction = (function () {
    'use strict';

    const stateStore = new WeakMap();
    let activeEditContext = null;
    let modalInitialized = false;

    const TYPE_LABELS = {
        string: '字符串',
        number: '数字',
        boolean: '布尔',
        null: '空值'
    };

    const TYPE_HINTS = {
        string: '直接输入文本内容，无需加引号。',
        number: '输入合法数字，例如 42、-3.14。',
        boolean: '输入 true 或 false。',
        null: '输入 null。'
    };

    function skipWs(str, pos) {
        while (pos.v < str.length && /\s/.test(str[pos.v])) {
            pos.v++;
        }
    }

    function indexToPos(str, index) {
        const lines = str.slice(0, index).split('\n');
        return {
            line: lines.length - 1,
            ch: lines[lines.length - 1].length
        };
    }

    function primitiveType(value) {
        if (value === null) return 'null';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        return 'string';
    }

    function collect(value, formatted) {
        const primitives = [];
        const pos = { v: 0 };

        try {
            walk(value, formatted, pos, [], primitives);
        } catch (e) {
            console.warn('JsonValueInteraction.collect failed:', e.message);
        }

        return primitives;
    }

    function walk(value, formatted, pos, path, primitives) {
        skipWs(formatted, pos);

        if (Array.isArray(value)) {
            if (formatted[pos.v] !== '[') return;
            pos.v++;
            skipWs(formatted, pos);

            if (value.length === 0) {
                if (formatted[pos.v] === ']') pos.v++;
                return;
            }

            for (let i = 0; i < value.length; i++) {
                walk(value[i], formatted, pos, path.concat(i), primitives);
                skipWs(formatted, pos);
                if (i < value.length - 1 && formatted[pos.v] === ',') {
                    pos.v++;
                    skipWs(formatted, pos);
                }
            }

            if (formatted[pos.v] === ']') pos.v++;
            return;
        }

        if (value !== null && typeof value === 'object') {
            if (formatted[pos.v] !== '{') return;
            pos.v++;
            skipWs(formatted, pos);

            const keys = Object.keys(value);
            if (keys.length === 0) {
                if (formatted[pos.v] === '}') pos.v++;
                return;
            }

            for (let i = 0; i < keys.length; i++) {
                skipWs(formatted, pos);
                skipJsonString(formatted, pos);
                skipWs(formatted, pos);
                if (formatted[pos.v] === ':') pos.v++;
                skipWs(formatted, pos);
                walk(value[keys[i]], formatted, pos, path.concat(keys[i]), primitives);
                skipWs(formatted, pos);
                if (i < keys.length - 1 && formatted[pos.v] === ',') {
                    pos.v++;
                }
            }

            skipWs(formatted, pos);
            if (formatted[pos.v] === '}') pos.v++;
            return;
        }

        const start = pos.v;
        skipJsonPrimitive(formatted, pos);
        if (pos.v <= start) return;

        primitives.push({
            path: path.slice(),
            from: indexToPos(formatted, start),
            to: indexToPos(formatted, pos.v),
            value,
            type: primitiveType(value),
            embeddedJson: typeof value === 'string' && typeof JsonUtils !== 'undefined'
                && JsonUtils.isEmbeddedJsonString(value)
        });
    }

    function skipJsonString(str, pos) {
        if (str[pos.v] !== '"') return;
        pos.v++;
        while (pos.v < str.length) {
            if (str[pos.v] === '\\') {
                pos.v += 2;
                continue;
            }
            if (str[pos.v] === '"') {
                pos.v++;
                return;
            }
            pos.v++;
        }
    }

    function skipJsonPrimitive(str, pos) {
        if (str[pos.v] === '"') {
            skipJsonString(str, pos);
            return;
        }

        if (str.slice(pos.v, pos.v + 4) === 'true') {
            pos.v += 4;
            return;
        }
        if (str.slice(pos.v, pos.v + 5) === 'false') {
            pos.v += 5;
            return;
        }
        if (str.slice(pos.v, pos.v + 4) === 'null') {
            pos.v += 4;
            return;
        }

        while (pos.v < str.length && /[-+0-9.eE]/.test(str[pos.v])) {
            pos.v++;
        }
    }

    function setAtPath(root, path, newValue) {
        if (!path.length) return root;
        let cur = root;
        for (let i = 0; i < path.length - 1; i++) {
            cur = cur[path[i]];
        }
        cur[path[path.length - 1]] = newValue;
        return root;
    }

    function getPrimitivesForEditor(editor) {
        const text = editor.getValue();
        if (!text.trim() || typeof JsonUtils === 'undefined') return [];

        const parsed = JsonUtils.parse(text);
        if (!parsed.ok) return [];

        return collect(parsed.value, text);
    }

    function posInRange(pos, from, to) {
        return CodeMirror.cmpPos(pos, from) >= 0 && CodeMirror.cmpPos(pos, to) < 0;
    }

    function findPrimitiveAt(editor, clickPos) {
        const primitives = getPrimitivesForEditor(editor);

        let item = primitives.find((p) => posInRange(clickPos, p.from, p.to));
        if (item) return item;

        item = primitives.find((p) => (
            p.from.line === clickPos.line
            && clickPos.ch >= p.from.ch
            && clickPos.ch < p.to.ch
        ));
        if (item) return item;

        return primitives.find((p) => {
            if (p.from.line !== clickPos.line) return false;
            const mid = (p.from.ch + p.to.ch) / 2;
            return Math.abs(clickPos.ch - mid) <= 2;
        }) || null;
    }

    function getClickPos(editor, event) {
        return editor.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
    }

    function formatCopyText(item) {
        if (item.type === 'string') return String(item.value);
        if (item.type === 'null') return 'null';
        return String(item.value);
    }

    function formatEditText(item) {
        if (item.type === 'string' && item.embeddedJson && typeof JsonUtils !== 'undefined') {
            const embedded = JsonUtils.tryParseEmbeddedJson(item.value);
            return JsonUtils.formatCanonical(embedded, { indent: 2 });
        }
        if (item.type === 'string') return String(item.value);
        if (item.type === 'null') return 'null';
        return String(item.value);
    }

    function parseEditText(text, type, item) {
        const trimmed = text.trim();

        switch (type) {
            case 'string':
                if (item?.embeddedJson) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        return JSON.stringify(parsed);
                    } catch (_) {
                        return undefined;
                    }
                }
                return text;
            case 'number': {
                if (!trimmed) return undefined;
                const num = Number(trimmed);
                if (Number.isNaN(num)) return undefined;
                return num;
            }
            case 'boolean':
                if (trimmed === 'true') return true;
                if (trimmed === 'false') return false;
                return undefined;
            case 'null':
                if (trimmed === 'null') return null;
                return undefined;
            default:
                return undefined;
        }
    }

    function initEditModal() {
        if (modalInitialized) return;
        modalInitialized = true;

        const modal = document.getElementById('jsonValueEditModal');
        const overlay = document.getElementById('jsonValueEditModalOverlay');
        const closeBtn = document.getElementById('jsonValueEditCloseBtn');
        const cancelBtn = document.getElementById('jsonValueEditCancelBtn');
        const saveBtn = document.getElementById('jsonValueEditSaveBtn');
        const input = document.getElementById('jsonValueEditInput');

        const close = () => closeEditModal();

        overlay?.addEventListener('click', close);
        closeBtn?.addEventListener('click', close);
        cancelBtn?.addEventListener('click', close);
        saveBtn?.addEventListener('click', () => commitEditModal());

        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !activeEditContext?.item?.embeddedJson) {
                event.preventDefault();
                commitEditModal();
            } else if (event.key === 'Enter' && event.metaKey) {
                event.preventDefault();
                commitEditModal();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeEditModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && activeEditContext) {
                closeEditModal();
            }
        });
    }

    function showEditError(message) {
        const errorEl = document.getElementById('jsonValueEditError');
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function clearEditError() {
        const errorEl = document.getElementById('jsonValueEditError');
        if (!errorEl) return;
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    function openEditModal(editor, state, item) {
        initEditModal();
        clearEditError();

        activeEditContext = { editor, state, item };

        const modal = document.getElementById('jsonValueEditModal');
        const hintEl = document.getElementById('jsonValueEditHint');
        const input = document.getElementById('jsonValueEditInput');

        if (!modal || !input) return;

        if (hintEl) {
            hintEl.textContent = item.embeddedJson
                ? '按 JSON 对象/数组编辑，保存后将自动转回字符串。'
                : (TYPE_HINTS[item.type] || '');
        }

        input.value = formatEditText(item);
        input.rows = item.embeddedJson
            ? Math.min(18, Math.max(10, input.value.split('\n').length))
            : 5;
        input.classList.toggle('is-multiline', !!item.embeddedJson);

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }

    function closeEditModal() {
        const modal = document.getElementById('jsonValueEditModal');
        modal?.classList.add('hidden');
        clearEditError();
        activeEditContext = null;
    }

    function commitEditModal() {
        if (!activeEditContext) return;

        const { state, item } = activeEditContext;
        const input = document.getElementById('jsonValueEditInput');
        if (!input) return;

        const parsed = parseEditText(input.value, item.type, item);
        if (parsed === undefined) {
            const typeLabel = item.embeddedJson ? '嵌入 JSON' : (TYPE_LABELS[item.type] || item.type);
            showEditError(`输入不符合 ${typeLabel} 类型，请检查后重试。`);
            input.focus();
            input.select();
            return;
        }

        if (!Object.is(parsed, item.value)) {
            if (typeof state.callbacks.onValueChange === 'function') {
                state.callbacks.onValueChange(item.path.slice(), parsed, item);
            }
        }

        closeEditModal();
    }

    function init(editor, callbacks) {
        if (!editor || typeof CodeMirror === 'undefined') return;

        initEditModal();

        const wrapper = editor.getWrapperElement();
        wrapper.classList.add('json-value-interactive');

        const state = {
            hoverMark: null,
            clickTimer: null,
            lastClickAt: 0,
            callbacks: callbacks || {}
        };
        stateStore.set(editor, state);

        editor.on('mousemove', (cm, event) => {
            if (activeEditContext) return;
            const item = findPrimitiveAt(cm, getClickPos(cm, event));
            setHover(cm, state, item);
        });

        wrapper.addEventListener('mouseleave', () => {
            setHover(editor, state, null);
        });

        const handlePointer = (editorInstance, event, isDouble) => {
            if (activeEditContext) return;
            if (editorInstance.getWrapperElement()?.classList.contains('json-output-expanded-view')) {
                return;
            }

            const item = findPrimitiveAt(editorInstance, getClickPos(editorInstance, event));
            if (!item) return;

            event.preventDefault();
            event.stopPropagation();

            if (isDouble) {
                clearTimeout(state.clickTimer);
                state.clickTimer = null;
                openEditModal(editorInstance, state, item);
                return;
            }

            const now = Date.now();
            if (now - state.lastClickAt < 320) {
                clearTimeout(state.clickTimer);
                state.clickTimer = null;
                openEditModal(editorInstance, state, item);
                return;
            }
            state.lastClickAt = now;

            clearTimeout(state.clickTimer);
            state.clickTimer = setTimeout(() => {
                state.clickTimer = null;
                copyPrimitive(editorInstance, state, item);
            }, 280);
        };

        editor.on('mousedown', (cm, event) => {
            if (event.button !== 0) return;
            handlePointer(cm, event, event.detail >= 2);
        });

        editor.on('dblclick', (cm, event) => {
            handlePointer(cm, event, true);
        });
    }

    function setHover(editor, state, item) {
        if (state.hoverMark) {
            state.hoverMark.clear();
            state.hoverMark = null;
        }

        if (!item) return;

        state.hoverMark = editor.markText(item.from, item.to, {
            className: 'json-value-hover'
        });
    }

    function showCopyFeedback(editor, item) {
        const flashMark = editor.markText(item.from, item.to, {
            className: 'json-value-copied'
        });

        const toast = document.getElementById('jsonFormatCopyToast');
        if (toast) {
            toast.textContent = '已复制';
            toast.classList.remove('fade-out');
            toast.classList.add('visible');
            clearTimeout(toast._hideTimer);
            toast._hideTimer = setTimeout(() => {
                toast.classList.add('fade-out');
                toast.classList.remove('visible');
            }, 900);
        }

        setTimeout(() => flashMark.clear(), 800);
    }

    function copyPrimitive(editor, state, item) {
        const text = formatCopyText(item);
        navigator.clipboard.writeText(text).then(() => {
            showCopyFeedback(editor, item);
            if (typeof state.callbacks.onCopy === 'function') {
                state.callbacks.onCopy(item, text);
            }
        }).catch(() => {
            if (typeof state.callbacks.onCopyError === 'function') {
                state.callbacks.onCopyError(item, text);
            }
        });
    }

    function refreshEditor(editor, formattedText) {
        const state = stateStore.get(editor);
        if (!state) return;

        if (activeEditContext?.editor === editor) {
            closeEditModal();
        }

        setHover(editor, state, null);
    }

    return {
        collect,
        setAtPath,
        init,
        refreshEditor
    };
})();
